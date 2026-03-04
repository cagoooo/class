/**
 * 教室考試監考系統模組 v4
 * Exam Proctor Enhancement Module
 * 
 * 功能：
 * - 考試科目管理（新增/編輯/刪除）- 點擊即可編輯時間
 * - 即時狀態顯示（進行中/剩餘時間）
 * - 進度條倒數顯示
 * - 多則提醒語設定（考試中/下課休息）
 * - 全螢幕監考模式（深色/淺色）
 * - 缺考人數記錄 - 可點擊輸入
 */

(function () {
    'use strict';

    // ========================================
    // 資料結構與狀態
    // ========================================

    // 考試科目列表
    let examSubjects = JSON.parse(localStorage.getItem('examSubjects')) || [
        { id: 1, name: '國語', startTime: '08:45', endTime: '09:25' },
        { id: 2, name: '數學', startTime: '09:35', endTime: '10:15' },
        { id: 3, name: '社會', startTime: '10:25', endTime: '11:05' }
    ];

    // 多則提醒語（考試中 + 下課休息）
    let examReminders = JSON.parse(localStorage.getItem('examReminders')) || {
        exam: [
            '考卷記得寫上班級姓名座號',
            '有問題舉手問老師，需要撿東西請監考老師幫',
            '不會寫的題目跳過寫會的題目',
            '耐心、細心、小心',
            '考卷有不會的問題等出題老師來了再問',
            '不要轉頭玩東西，寫完多檢查',
            '檢查完再檢查或趴下休息',
            '考試即將結束，檢查有沒有寫答案抄錯'
        ],
        break: [
            '等監考老師點完再離開座位下課',
            '利用下課準備下個科目與文具用品',
            '提早上廁所喝水',
            '桌面淨空',
            '準備考試、收拾位置、坐在位置上'
        ]
    };

    // 當前顯示的提醒索引
    let currentReminderIndex = 0;
    let reminderRotationInterval = null;

    // 缺考記錄（擴展版 - 支援各科目缺考學生記錄）
    let examAttendance = JSON.parse(localStorage.getItem('examAttendance')) || {
        expected: 0,
        present: 0,
        absentNote: ''
    };

    // 缺考學生詳細記錄
    let absenceRecords = JSON.parse(localStorage.getItem('examAbsenceRecords')) || [];

    // 缺考原因類型
    const AbsenceTypes = {
        sick: { label: '病假', icon: '🤒', color: '#ef4444' },
        personal: { label: '事假', icon: '📝', color: '#f59e0b' },
        official: { label: '公假', icon: '🏫', color: '#3b82f6' },
        other: { label: '其他', icon: '❓', color: '#6b7280' }
    };

    // 全螢幕更新計時器
    let examClockInterval = null;

    // 淺色模式
    let isLightMode = JSON.parse(localStorage.getItem('examLightMode')) || false;

    // 類比時鐘模式
    let isAnalogClock = JSON.parse(localStorage.getItem('examAnalogClock')) || false;


    // ========================================
    // 注入 CSS 樣式 - 增強版 v4
    // ========================================

    const examStyles = `
        /* 考試監考全螢幕 Modal */
        .exam-fullscreen-modal {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: none;
            background: #1a1f2e;
            font-family: 'Noto Sans TC', system-ui, sans-serif;
            transition: background 0.3s ease;
        }

        /* 淺色模式 */
        .exam-fullscreen-modal.light-mode {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%);
        }

        .exam-fullscreen-modal.active {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: minmax(150px, 35vh) minmax(0, 1fr) auto;
            height: 100vh;
            overflow: hidden;
        }

        /* 左上區域 - 時鐘 */
        .exam-clock-area {
            grid-column: 1;
            grid-row: 1 / 3;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 0.75rem 1.5rem;
            background: #1e2538;
            transition: background 0.3s ease;
            max-height: 45vh;
            overflow: hidden;
        }

        .light-mode .exam-clock-area {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            box-shadow: 4px 0 20px rgba(0, 0, 0, 0.05);
        }

        .exam-date-display {
            color: rgba(255, 255, 255, 0.7);
            font-size: clamp(1rem, 2vw, 1.5rem);
            margin-bottom: 0.5rem;
        }

        .light-mode .exam-date-display {
            color: #64748b;
        }

        .exam-time-display {
            color: #ffffff;
            font-size: clamp(3.5rem, 10vw, 8rem);
            font-weight: 700;
            line-height: 1;
            letter-spacing: -0.02em;
        }

        .light-mode .exam-time-display {
            color: #0f172a;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.05);
        }

        /* 隱藏數位時鐘（當類比時鐘模式開啟時） */
        .analog-mode .exam-time-display,
        .analog-mode .exam-date-display {
            display: none;
        }

        /* 類比時鐘樣式 - 保持正圓形 */
        .exam-analog-clock {
            display: none;
            position: relative;
            width: min(32vh, 35vw, 260px);
            height: min(32vh, 35vw, 260px);
            aspect-ratio: 1 / 1;
            border-radius: 50%;
            background: linear-gradient(145deg, #2a3347 0%, #1a1f2e 100%);
            box-shadow: 
                0 0 40px rgba(0, 0, 0, 0.3),
                inset 0 0 30px rgba(255, 255, 255, 0.03),
                0 4px 15px rgba(0, 0, 0, 0.4);
            border: 4px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
        }

        .analog-mode .exam-analog-clock {
            display: block;
        }

        .light-mode .exam-analog-clock {
            background: linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%);
            border: 4px solid #e2e8f0;
            box-shadow: 
                0 0 40px rgba(0, 0, 0, 0.08),
                inset 0 0 20px rgba(0, 0, 0, 0.02),
                0 8px 25px rgba(0, 0, 0, 0.12);
        }

        /* 時鐘中心點 */
        .exam-clock-center {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            z-index: 10;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
        }

        .light-mode .exam-clock-center {
            background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
            box-shadow: 0 2px 6px rgba(30, 64, 175, 0.5);
        }

        /* 時鐘刻度容器 */
        .exam-clock-marks {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
        }

        /* 刻度線 - 從時鐘邊緣向內 */
        .exam-clock-mark {
            position: absolute;
            top: 4%;
            left: 50%;
            width: 2px;
            height: 3%;
            margin-left: -1px;
            background: rgba(255, 255, 255, 0.3);
            transform-origin: 50% 1150%;
            border-radius: 1px;
        }

        .exam-clock-mark.hour-mark {
            width: 3px;
            height: 5%;
            margin-left: -1.5px;
            background: rgba(255, 255, 255, 0.6);
            transform-origin: 50% 900%;
        }

        .light-mode .exam-clock-mark {
            background: rgba(0, 0, 0, 0.15);
        }

        .light-mode .exam-clock-mark.hour-mark {
            background: rgba(0, 0, 0, 0.4);
        }

        /* 時鐘數字 - 使用絕對定位環繞圓心 */
        .exam-clock-numbers {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }

        .exam-clock-number {
            position: absolute;
            font-size: clamp(0.9rem, 1.5vw, 1.25rem);
            font-weight: 700;
            color: rgba(255, 255, 255, 0.85);
            text-align: center;
            width: 30px;
            height: 30px;
            line-height: 30px;
            margin-left: -15px;
            margin-top: -15px;
        }

        .light-mode .exam-clock-number {
            color: #475569;
        }

        /* 時針 - 使用百分比確保比例正確 */
        .exam-clock-hand-hour {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 6px;
            height: 22%;
            margin-left: -3px;
            transform-origin: 50% 100%;
            background: linear-gradient(to top, #94a3b8 0%, #e2e8f0 100%);
            border-radius: 3px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            z-index: 3;
        }

        .light-mode .exam-clock-hand-hour {
            background: linear-gradient(to top, #1e293b 0%, #475569 100%);
        }

        /* 分針 */
        .exam-clock-hand-minute {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 4px;
            height: 32%;
            margin-left: -2px;
            transform-origin: 50% 100%;
            background: linear-gradient(to top, #3b82f6 0%, #93c5fd 100%);
            border-radius: 2px;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
            z-index: 4;
        }

        .light-mode .exam-clock-hand-minute {
            background: linear-gradient(to top, #1d4ed8 0%, #3b82f6 100%);
        }

        /* 秒針 */
        .exam-clock-hand-second {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 2px;
            height: 38%;
            margin-left: -1px;
            transform-origin: 50% 100%;
            background: #ef4444;
            border-radius: 1px;
            box-shadow: 0 2px 4px rgba(239, 68, 68, 0.5);
            z-index: 5;
        }

        /* 類比模式下的日期顯示 */
        .exam-analog-date {
            display: none;
            margin-top: 0.75rem;
            color: rgba(255, 255, 255, 0.8);
            font-size: clamp(0.85rem, 1.5vw, 1.2rem);
            text-align: center;
            font-weight: 500;
        }

        .analog-mode .exam-analog-date {
            display: block;
        }

        .light-mode .exam-analog-date {
            color: #475569;
        }

        /* 右上區域 - 狀態條與進度條 */
        .exam-status-area {
            grid-column: 2;
            grid-row: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 1.5rem 2rem;
            gap: 1rem;
            overflow: hidden;
        }

        .exam-status-bar {
            background: #22c55e;
            color: white;
            padding: 1.5rem 3rem;
            border-radius: 1rem;
            font-size: clamp(2rem, 5vw, 4rem);
            font-weight: 700;
            text-align: center;
            min-width: 300px;
            max-width: 100%;
            box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3);
            line-height: 1.3;
        }

        .exam-status-remaining {
            display: block;
            font-size: clamp(1.5rem, 4vw, 2.8rem);
            font-weight: 600;
            opacity: 1;
            margin-top: 0.5rem;
            background: rgba(255, 255, 255, 0.25);
            padding: 0.6rem 2rem;
            border-radius: 2rem;
            animation: pulse-remaining 2s ease-in-out infinite;
        }

        @keyframes pulse-remaining {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(1.02); }
        }

        .exam-status-bar.waiting {
            background: transparent;
            box-shadow: none;
            padding: 1rem;
            min-width: auto;
        }

        .exam-status-bar.finished {
            background: transparent;
            box-shadow: none;
            padding: 1rem;
            min-width: auto;
        }

        /* 進度條容器 */
        .exam-progress-container {
            width: 100%;
            max-width: 500px;
        }

        .exam-progress-label {
            display: flex;
            justify-content: space-between;
            color: rgba(255, 255, 255, 0.8);
            font-size: clamp(1rem, 2vw, 1.5rem);
            font-weight: 500;
            margin-bottom: 0.75rem;
        }

        .light-mode .exam-progress-label {
            color: #475569;
        }

        .exam-progress-bar {
            width: 100%;
            height: 16px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            overflow: hidden;
        }

        .light-mode .exam-progress-bar {
            background: rgba(0, 0, 0, 0.1);
        }

        .exam-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #22c55e 0%, #4ade80 50%, #86efac 100%);
            border-radius: 8px;
            transition: width 1s linear;
        }

        .exam-progress-fill.warning {
            background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
        }

        .exam-progress-fill.danger {
            background: linear-gradient(90deg, #dc2626 0%, #ef4444 100%);
            animation: pulse-danger 1s ease-in-out infinite;
        }

        @keyframes pulse-danger {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* 左下區域 - 科目列表與缺考記錄 */
        .exam-subjects-area {
            grid-column: 1;
            grid-row: 3;
            display: flex;
            flex-direction: column;
            padding: 1rem 2rem 1.5rem;
            background: #1e2538;
            gap: 1rem;
            transition: background 0.3s ease;
            overflow-y: auto;
            max-height: 55vh;
        }

        .light-mode .exam-subjects-area {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        }

        .exam-subjects-list {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            gap: 0.5rem;
        }

        .exam-subject-item {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            padding: 1rem 2rem;
            margin-bottom: 0.75rem;
            border-radius: 0.75rem;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.8);
            font-size: clamp(1.1rem, 2.5vw, 1.6rem);
            transition: all 0.3s ease;
            border: 2px solid transparent;
            cursor: pointer;
            gap: 1.5rem;
        }

        .light-mode .exam-subject-item {
            background: #f1f5f9;
            color: #334155;
            border: 2px solid #e2e8f0;
        }

        .exam-subject-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .light-mode .exam-subject-item:hover {
            background: #e2e8f0;
            border-color: #94a3b8;
        }

        .exam-subject-item.active {
            background: linear-gradient(135deg, #facc15 0%, #fde047 100%);
            color: #1a1f2e;
            font-weight: 700;
            border-color: #facc15;
            box-shadow: 0 4px 15px rgba(250, 204, 21, 0.3);
        }

        .light-mode .exam-subject-item.active {
            background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%);
            color: white;
            border-color: #22c55e;
            box-shadow: 0 8px 25px rgba(34, 197, 94, 0.3);
        }

        .exam-subject-name {
            min-width: 80px;
            font-weight: 700;
            font-size: clamp(1rem, 2vw, 1.3em);
            text-align: center;
            position: relative;
            padding: 0.25rem 0.5rem;
            border-radius: 0.5rem;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .exam-subject-name::after {
            content: '✏️';
            position: absolute;
            right: -1.5rem;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.7em;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .exam-subject-name:hover {
            background: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
        }

        .light-mode .exam-subject-name:hover {
            background: rgba(59, 130, 246, 0.15);
            color: #2563eb;
        }

        .exam-subject-name:hover::after {
            opacity: 1;
        }

        .exam-subject-time {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            padding: 0.4rem 0.75rem;
            border-radius: 0.5rem;
            transition: all 0.2s ease;
            font-size: clamp(0.85rem, 1.5vw, 1rem);
        }

        .exam-subject-time:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .light-mode .exam-subject-time:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        .exam-subject-time .clock-icon {
            opacity: 0.7;
            font-size: 1.2em;
        }

        /* 缺考記錄區 */
        .exam-attendance-area {
            display: flex;
            align-items: stretch;
            gap: 1rem;
            background: rgba(255, 255, 255, 0.05);
            padding: 1rem;
            border-radius: 0.75rem;
        }

        .light-mode .exam-attendance-area {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
        }

        .exam-attendance-box {
            background: rgba(255, 255, 255, 0.08);
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            text-align: center;
            min-width: 100px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }

        .light-mode .exam-attendance-box {
            background: white;
            border: 2px solid #e2e8f0;
        }

        .exam-attendance-box:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(59, 130, 246, 0.5);
        }

        .light-mode .exam-attendance-box:hover {
            background: #f8fafc;
            border-color: #3b82f6;
        }

        .exam-attendance-label {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
            margin-bottom: 0.25rem;
        }

        .light-mode .exam-attendance-label {
            color: #64748b;
        }

        .exam-attendance-value {
            color: #3b82f6;
            font-size: clamp(2rem, 4vw, 3rem);
            font-weight: 700;
        }

        .exam-attendance-note-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .exam-attendance-note-label {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
        }

        .light-mode .exam-attendance-note-label {
            color: #64748b;
        }

        .exam-attendance-note {
            flex: 1;
            background: white;
            border: none;
            border-radius: 0.5rem;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            resize: none;
            color: #374151;
        }

        .light-mode .exam-attendance-note {
            border: 1px solid #e2e8f0;
        }

        .exam-attendance-note::placeholder {
            color: #9ca3af;
        }

        .exam-attendance-buttons {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .exam-attendance-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            width: 48px;
            height: 48px;
            border-radius: 0.5rem;
            font-size: 1.25rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .light-mode .exam-attendance-btn {
            background: #e2e8f0;
            color: #475569;
        }

        .exam-attendance-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .light-mode .exam-attendance-btn:hover {
            background: #cbd5e1;
        }

        .exam-attendance-btn.settings {
            background: rgba(59, 130, 246, 0.2);
        }

        .light-mode .exam-attendance-btn.settings {
            background: #dbeafe;
            color: #2563eb;
        }

        .exam-attendance-btn.hide {
            background: rgba(59, 130, 246, 0.8);
        }

        .light-mode .exam-attendance-btn.hide {
            background: #3b82f6;
            color: white;
        }

        /* 右下區域 - 提醒語 */
        .exam-reminder-area {
            grid-column: 2;
            grid-row: 2 / 4;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem 1.5rem;
            overflow-y: auto;
            min-height: 0;
        }

        .exam-reminder-card {
            background: #e0f2fe;
            border-radius: 1.5rem;
            padding: 2.5rem 3rem;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .light-mode .exam-reminder-card {
            background: white;
            border: 2px solid #e0f2fe;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
        }

        .exam-reminder-title {
            color: #0369a1;
            font-size: clamp(1rem, 2vw, 1.3rem);
            margin-bottom: 1.5rem;
            font-weight: 500;
        }

        .exam-reminder-text {
            color: #0c4a6e;
            font-size: clamp(2rem, 4.5vw, 3.5rem);
            font-weight: 700;
            line-height: 1.3;
        }

        .exam-reminder-counter {
            color: #0369a1;
            font-size: 0.9rem;
            margin-top: 1rem;
            opacity: 0.7;
        }

        /* 關閉與控制按鈕 */
        .exam-fullscreen-controls {
            position: absolute;
            top: 1rem;
            left: 1rem;
            display: flex;
            gap: 0.5rem;
            z-index: 10;
        }

        .exam-control-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            font-size: 1.25rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .light-mode .exam-control-btn {
            background: rgba(0, 0, 0, 0.1);
            color: #334155;
        }

        .exam-control-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        .light-mode .exam-control-btn:hover {
            background: rgba(0, 0, 0, 0.15);
        }

        /* 小標簽提示 */
        .exam-fullscreen-hint {
            position: absolute;
            right: 1rem;
            bottom: 1rem;
            color: rgba(255, 255, 255, 0.4);
            font-size: 0.75rem;
        }

        .light-mode .exam-fullscreen-hint {
            color: rgba(0, 0, 0, 0.3);
        }

        /* ========================================
           設定提醒面板 - 優化版
           ======================================== */
        .exam-settings-panel {
            position: fixed;
            inset: 0;
            z-index: 200;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .exam-settings-panel.active {
            display: flex;
        }

        .exam-settings-content {
            background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
            border-radius: 1.5rem;
            max-width: 950px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255,255,255,0.1);
            animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .exam-settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 1.5rem 1.5rem 0 0;
        }

        .exam-settings-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: white;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .exam-settings-title::before {
            content: '⚙️';
            font-size: 1.3rem;
        }

        .exam-settings-close {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            padding: 0.6rem 1.25rem;
            border-radius: 2rem;
            font-size: 0.95rem;
            font-weight: 500;
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .exam-settings-close:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.05);
        }

        .exam-settings-body {
            padding: 2rem;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }

        .exam-settings-column {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            background: white;
            padding: 1.5rem;
            border-radius: 1rem;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
            border: 1px solid #e5e7eb;
        }

        .exam-settings-column-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 0.75rem;
            border-bottom: 2px dashed #e5e7eb;
        }

        .exam-settings-column-title {
            font-size: 1.15rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .exam-settings-column-title.exam-type {
            color: #2563eb;
        }

        .exam-settings-column-title.exam-type::before {
            content: '📝';
        }

        .exam-settings-column-title.break-type {
            color: #059669;
        }

        .exam-settings-column-title.break-type::before {
            content: '☕';
        }

        .exam-settings-add-btn {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            color: white;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 1.25rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .exam-settings-add-btn:hover {
            transform: scale(1.15) rotate(90deg);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .exam-reminder-list {
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            min-height: 180px;
            max-height: 350px;
            overflow-y: auto;
            padding-right: 0.5rem;
        }

        .exam-reminder-item {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: linear-gradient(to right, #f8fafc, #ffffff);
            border-radius: 0.75rem;
            border: 1px solid #e5e7eb;
            transition: all 0.3s ease;
            position: relative;
            min-height: 48px;
        }

        .exam-reminder-item:hover {
            background: linear-gradient(to right, #f1f5f9, #f8fafc);
            border-color: #cbd5e1;
            transform: translateX(4px);
            box-shadow: -4px 0 0 #3b82f6, 0 2px 8px rgba(0,0,0,0.05);
        }

        .exam-reminder-item.dragging {
            opacity: 0.6;
            background: linear-gradient(to right, #dbeafe, #ede9fe);
            border-color: #3b82f6;
            transform: scale(1.02);
        }

        .exam-reminder-drag {
            cursor: grab;
            color: #9ca3af;
            font-size: 1.2rem;
            transition: color 0.3s ease;
            user-select: none;
        }

        .exam-reminder-drag:hover {
            color: #3b82f6;
        }

        .exam-reminder-drag:active {
            cursor: grabbing;
            color: #1d4ed8;
        }

        .exam-reminder-input {
            flex: 1;
            border: none;
            background: transparent;
            font-size: 0.95rem;
            color: #374151;
            outline: none;
            padding: 0.25rem;
            border-radius: 0.25rem;
            transition: all 0.3s ease;
            word-break: break-word;
            line-height: 1.4;
            min-width: 0;
        }

        .exam-reminder-input:focus {
            background: #f1f5f9;
            padding: 0.5rem;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
        }

        .exam-reminder-delete {
            background: transparent;
            border: none;
            color: #d1d5db;
            cursor: pointer;
            font-size: 1.1rem;
            padding: 0.35rem;
            border-radius: 0.5rem;
            transition: all 0.3s ease;
            opacity: 0.6;
        }

        .exam-reminder-item:hover .exam-reminder-delete {
            opacity: 1;
        }

        .exam-reminder-delete:hover {
            color: #ef4444;
            background: #fef2f2;
            transform: scale(1.1);
        }

        /* 休息時間倒數樣式 */
        .exam-break-countdown {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }

        .exam-break-emoji {
            font-size: clamp(3rem, 8vw, 5rem);
            animation: bounce 2s ease-in-out infinite;
        }

        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
        }

        .exam-break-message {
            font-size: clamp(1.5rem, 3vw, 2rem);
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            text-align: center;
        }

        .light-mode .exam-break-message {
            color: #475569;
        }

        .exam-break-time {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem 2rem;
            border-radius: 1rem;
        }

        .light-mode .exam-break-time {
            background: rgba(0, 0, 0, 0.05);
        }

        .exam-break-digit {
            background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 700;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            min-width: 60px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
        }

        .light-mode .exam-break-digit {
            background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
        }

        .exam-break-separator {
            font-size: clamp(2rem, 5vw, 3rem);
            font-weight: 700;
            color: rgba(255, 255, 255, 0.6);
            animation: blink 1s ease-in-out infinite;
        }

        .light-mode .exam-break-separator {
            color: #94a3b8;
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .exam-break-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
            text-align: center;
            margin-top: 0.25rem;
        }

        .light-mode .exam-break-label {
            color: #64748b;
        }

        /* RWD for settings panel */
        @media (max-width: 768px) {
            .exam-settings-body {
                grid-template-columns: 1fr;
                padding: 1rem;
            }

            .exam-settings-column {
                padding: 1rem;
            }

            .exam-settings-header {
                flex-direction: column;
                gap: 1rem;
                text-align: center;
            }
        }
            border-radius: 0.25rem;
            box-shadow: 0 0 0 2px #3b82f6;
        }

        .exam-reminder-delete {
            background: transparent;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            font-size: 1.1rem;
            padding: 0.25rem;
            border-radius: 0.25rem;
            transition: all 0.3s ease;
        }

        .exam-reminder-delete:hover {
            color: #ef4444;
            background: #fef2f2;
        }

        /* 時間選擇器彈窗 */
        .exam-time-picker {
            position: fixed;
            z-index: 10000;
            background: white;
            border-radius: 0.75rem;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
            padding: 1rem;
            display: none;
            max-width: calc(100vw - 20px);
            max-height: calc(100vh - 20px);
            overflow: auto;
        }

        .exam-time-picker.active {
            display: block;
        }

        .exam-time-picker-header {
            font-size: 0.9rem;
            color: #6b7280;
            margin-bottom: 0.75rem;
            text-align: center;
        }

        .exam-time-picker-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.5rem;
        }

        .exam-time-picker-btn {
            padding: 0.5rem 0.75rem;
            border: 1px solid #e5e7eb;
            background: white;
            border-radius: 0.375rem;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s ease;
        }

        .exam-time-picker-btn:hover {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
        }

        .exam-time-picker-btn.selected {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
        }

        /* RWD 調整 - 平板與中等螢幕 */
        @media (max-width: 1200px) {
            .exam-fullscreen-modal.active {
                grid-template-columns: 1fr;
                grid-template-rows: auto auto auto auto;
            }

            .exam-clock-area {
                grid-column: 1;
                grid-row: 1;
                padding: 1rem 1.5rem;
                align-items: center;
                text-align: center;
            }

            .exam-status-area {
                grid-column: 1;
                grid-row: 2;
                padding: 0.75rem 1.5rem;
            }

            .exam-subjects-area {
                grid-column: 1;
                grid-row: 3;
                padding: 0.75rem 1rem;
                max-height: 180px;
                overflow-y: auto;
            }

            .exam-reminder-area {
                grid-column: 1;
                grid-row: 4;
                padding: 0.75rem 1rem;
                max-height: 200px;
                overflow-y: auto;
            }

            .exam-time-display {
                font-size: clamp(2.5rem, 8vw, 4.5rem);
            }

            .exam-subject-item {
                font-size: clamp(0.8rem, 2vw, 1rem);
                padding: 0.6rem 1rem;
            }

            .exam-subject-name {
                min-width: 60px;
            }

            .exam-subject-name::after {
                right: -1rem;
                font-size: 0.6em;
            }

            .exam-settings-body {
                grid-template-columns: 1fr;
            }
        }

        /* RWD 調整 - 手機 */
        @media (max-width: 640px) {
            .exam-clock-area {
                padding: 0.75rem;
            }

            .exam-date-display {
                font-size: 0.85rem;
            }

            .exam-time-display {
                font-size: clamp(2.5rem, 12vw, 4rem);
            }

            .exam-status-bar {
                min-width: auto;
                padding: 0.5rem 1rem;
                font-size: 0.9rem;
            }

            .exam-subject-item {
                flex-direction: row;
                flex-wrap: wrap;
                justify-content: center;
                gap: 0.4rem;
                padding: 0.5rem 0.75rem;
                font-size: 0.8rem;
            }

            .exam-subject-name {
                font-size: 0.95em;
                min-width: 50px;
            }

            .exam-subject-name::after {
                display: none;
            }

            .exam-subject-time {
                font-size: 0.75rem;
                padding: 0.25rem 0.5rem;
            }

            .exam-attendance-area {
                flex-direction: column;
                padding: 0.5rem;
                gap: 0.5rem;
            }

            .exam-attendance-box {
                min-width: auto;
                padding: 0.5rem 1rem;
            }

            .exam-attendance-value {
                font-size: 1.5rem;
            }

            .exam-attendance-buttons {
                flex-direction: row;
            }

            .exam-reminder-card {
                padding: 1rem;
            }

            .exam-reminder-text {
                font-size: 1.2rem;
            }

            .exam-break-emoji {
                font-size: 2rem;
            }

            .exam-break-message {
                font-size: 1rem;
            }

            .exam-break-digit {
                font-size: 1.5rem;
                min-width: 40px;
                padding: 0.25rem 0.5rem;
            }

            .exam-break-separator {
                font-size: 1.5rem;
            }
        }

        /* ========================================
           缺考學生管理面板樣式
           ======================================== */
        .absence-manager-panel {
            position: fixed;
            inset: 0;
            z-index: 400;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .absence-manager-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
        }

        .absence-manager-content {
            position: relative;
            width: 90%;
            max-width: 700px;
            max-height: 85vh;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .absence-manager-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.25rem 1.5rem;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
        }

        .absence-manager-header h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 700;
        }

        .absence-subject-selector select {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            font-size: 0.9rem;
            cursor: pointer;
        }

        .absence-subject-selector select option {
            color: #333;
        }

        .absence-manager-close {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 1.25rem;
            cursor: pointer;
            transition: background 0.2s;
        }

        .absence-manager-close:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .absence-manager-body {
            flex: 1;
            overflow-y: auto;
            padding: 1.5rem;
        }

        .absence-add-section, .absence-list-section {
            margin-bottom: 1.5rem;
        }

        .absence-add-section h4, .absence-list-section h4 {
            margin: 0 0 1rem;
            font-size: 1rem;
            font-weight: 600;
            color: #374151;
        }

        .absence-add-form {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }

        .absence-input {
            padding: 0.625rem 1rem;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 0.9rem;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .absence-input:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .absence-add-btn {
            grid-column: span 2;
            padding: 0.75rem 1rem;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .absence-add-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
        }

        .absence-list {
            max-height: 250px;
            overflow-y: auto;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
        }

        .absence-empty {
            padding: 2rem;
            text-align: center;
            color: #9ca3af;
        }

        .absence-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #f3f4f6;
            transition: background 0.2s;
        }

        .absence-item:last-child {
            border-bottom: none;
        }

        .absence-item:hover {
            background: #f9fafb;
        }

        .absence-type-icon {
            font-size: 1.25rem;
        }

        .absence-name {
            font-weight: 600;
            color: #1f2937;
        }

        .absence-type-label {
            padding: 0.25rem 0.5rem;
            background: #f3f4f6;
            border-radius: 4px;
            font-size: 0.75rem;
            color: #6b7280;
        }

        .absence-note {
            flex: 1;
            font-size: 0.85rem;
            color: #9ca3af;
            font-style: italic;
        }

        .absence-remove-btn {
            background: transparent;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            font-size: 1rem;
            padding: 0.25rem;
            border-radius: 4px;
            transition: color 0.2s, background 0.2s;
        }

        .absence-remove-btn:hover {
            color: #ef4444;
            background: #fef2f2;
        }

        .absence-stats-section {
            display: flex;
            gap: 1rem;
            padding: 1rem;
            background: #f8fafc;
            border-radius: 8px;
        }

        .absence-stat {
            flex: 1;
            text-align: center;
            padding: 0.75rem;
            background: white;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }

        .stat-label {
            display: block;
            font-size: 0.8rem;
            color: #6b7280;
            margin-bottom: 0.25rem;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #3b82f6;
        }

        .absence-manager-footer {
            display: flex;
            gap: 1rem;
            padding: 1rem 1.5rem;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            justify-content: flex-end;
        }

        .absence-export-btn, .absence-close-btn {
            padding: 0.625rem 1.25rem;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .absence-export-btn {
            background: #3b82f6;
            color: white;
            border: none;
        }

        .absence-export-btn:hover {
            background: #2563eb;
        }

        .absence-close-btn {
            background: white;
            color: #4b5563;
            border: 1px solid #d1d5db;
        }

        .absence-close-btn:hover {
            background: #f3f4f6;
        }

        /* 衝突指示器動畫 */
        @keyframes pulse-warning {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
        }

        /* RWD for absence manager */
        @media (max-width: 640px) {
            .absence-manager-content {
                width: 95%;
                max-height: 90vh;
            }

            .absence-add-form {
                grid-template-columns: 1fr;
            }

            .absence-add-btn {
                grid-column: span 1;
            }

            .absence-stats-section {
                flex-direction: column;
            }
        }
    `;

    // ========================================
    // 工具函數
    // ========================================

    function getCurrentTimeString() {
        const now = new Date();
        return now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');
    }

    /**
     * 顯示通知訊息
     * @param {string} message - 訊息內容
     * @param {string} type - 類型 (success, warning, error, info)
     */
    function showNotification(message, type = 'info') {
        // 移除舊通知
        const oldNotif = document.querySelector('.exam-toast-notification');
        if (oldNotif) oldNotif.remove();

        const colors = {
            success: { bg: 'linear-gradient(135deg, #22c55e, #16a34a)', icon: '✅' },
            warning: { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', icon: '⚠️' },
            error: { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', icon: '❌' },
            info: { bg: 'linear-gradient(135deg, #3b82f6, #2563eb)', icon: 'ℹ️' }
        };
        const style = colors[type] || colors.info;

        const notif = document.createElement('div');
        notif.className = 'exam-toast-notification';
        notif.innerHTML = `<span>${style.icon}</span><span>${message}</span>`;
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 1.5rem;
            background: ${style.bg};
            color: white;
            border-radius: 8px;
            font-weight: 500;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(notif);

        // 3秒後自動移除
        setTimeout(() => {
            notif.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }

    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function getCurrentExam() {
        const currentMinutes = timeToMinutes(getCurrentTimeString());
        return examSubjects.find(subject => {
            const start = timeToMinutes(subject.startTime);
            const end = timeToMinutes(subject.endTime);
            return currentMinutes >= start && currentMinutes < end;
        });
    }

    function getRemainingMinutes(subject) {
        if (!subject) return 0;
        const currentMinutes = timeToMinutes(getCurrentTimeString());
        const end = timeToMinutes(subject.endTime);
        return Math.max(0, end - currentMinutes);
    }

    function getExamProgress(subject) {
        if (!subject) return 0;
        const currentMinutes = timeToMinutes(getCurrentTimeString());
        const start = timeToMinutes(subject.startTime);
        const end = timeToMinutes(subject.endTime);
        const total = end - start;
        const elapsed = currentMinutes - start;
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }

    function formatROCDate() {
        const now = new Date();
        const year = now.getFullYear() - 1911;
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[now.getDay()];
        return `民國${year}年${month}月${day}日 星期${weekday}`;
    }

    function formatTime() {
        const now = new Date();
        return now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0') + ':' +
            now.getSeconds().toString().padStart(2, '0');
    }

    function saveData() {
        localStorage.setItem('examSubjects', JSON.stringify(examSubjects));
        localStorage.setItem('examReminders', JSON.stringify(examReminders));
        localStorage.setItem('examAttendance', JSON.stringify(examAttendance));
        localStorage.setItem('examLightMode', JSON.stringify(isLightMode));
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // UI 渲染函數
    // ========================================

    function renderSubjectList() {
        const container = document.getElementById('examSubjectList');
        if (!container) return;

        if (examSubjects.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center p-6 text-lg">尚未新增考試科目</div>';
            return;
        }

        container.innerHTML = examSubjects.map(subject => `
            <div class="flex flex-col sm:flex-row items-center justify-center sm:justify-between bg-gradient-to-r from-gray-50 to-white p-4 sm:p-5 rounded-xl mb-3 hover:shadow-md transition-all duration-300 border border-gray-100">
                <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 mb-2 sm:mb-0">
                    <span class="font-bold text-gray-800 text-lg sm:text-xl cursor-pointer hover:text-teal-600 hover:underline transition-colors" onclick="editSubjectName(${subject.id})">${escapeHtml(subject.name)}</span>
                    <div class="flex items-center gap-2 text-base sm:text-lg">
                        <span class="text-teal-600 font-semibold cursor-pointer hover:text-teal-800 hover:underline px-2 py-1 rounded hover:bg-teal-50 transition-colors" onclick="openSubjectTimePicker(${subject.id}, 'start', event)">
                            🕐 ${subject.startTime}
                        </span>
                        <span class="text-gray-400 font-medium">~</span>
                        <span class="text-teal-600 font-semibold cursor-pointer hover:text-teal-800 hover:underline px-2 py-1 rounded hover:bg-teal-50 transition-colors" onclick="openSubjectTimePicker(${subject.id}, 'end', event)">
                            ${subject.endTime} 🕐
                        </span>
                    </div>
                </div>
                <button onclick="deleteExamSubject(${subject.id})" 
                    class="text-red-400 hover:text-red-600 text-lg px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
                    🗑️
                </button>
            </div>
        `).join('');
    }

    function renderReminderPreview() {
        const container = document.getElementById('examReminderPreview');
        if (!container) return;

        const allReminders = [...examReminders.exam.slice(0, 3), ...examReminders.break.slice(0, 2)];
        if (allReminders.length === 0) {
            container.innerHTML = '<div class="text-gray-400 text-center">尚無提醒</div>';
            return;
        }

        container.innerHTML = allReminders.map((r, i) =>
            `<div class="truncate">${i + 1}. ${escapeHtml(r)}</div>`
        ).join('') + (examReminders.exam.length + examReminders.break.length > 5
            ? `<div class="text-teal-600 cursor-pointer" onclick="openExamSettings()">...共 ${examReminders.exam.length + examReminders.break.length} 則</div>`
            : '');
    }

    function renderFullscreenSubjects() {
        const container = document.getElementById('examFullscreenSubjects');
        if (!container) return;

        const currentExam = getCurrentExam();

        container.innerHTML = examSubjects.map(subject => {
            const isActive = currentExam && currentExam.id === subject.id;
            const startHour = parseInt(subject.startTime.split(':')[0]);
            const period = startHour < 12 ? '上午' : '下午';
            return `
                <div class="exam-subject-item ${isActive ? 'active' : ''}" data-id="${subject.id}">
                    <span class="exam-subject-name" onclick="editSubjectName(${subject.id})" style="cursor: pointer;" title="點擊編輯科目名稱">${escapeHtml(subject.name)}</span>
                    <span class="exam-subject-time" onclick="openTimePicker(${subject.id}, 'start', event)">
                        <span class="clock-icon">${isActive ? '🔴' : '🕐'}</span>
                        ${period} ${subject.startTime}
                    </span>
                    <span style="color: inherit; opacity: 0.5;">~</span>
                    <span class="exam-subject-time" onclick="openTimePicker(${subject.id}, 'end', event)">
                        ${period} ${subject.endTime}
                        <span class="clock-icon">🕐</span>
                    </span>
                </div>
            `;
        }).join('');
    }

    function updateFullscreenStatus() {
        const dateEl = document.getElementById('examFullscreenDate');
        const timeEl = document.getElementById('examFullscreenTime');
        const statusEl = document.getElementById('examFullscreenStatus');
        const reminderEl = document.getElementById('examFullscreenReminder');
        const reminderCounterEl = document.getElementById('examReminderCounter');
        const progressFill = document.getElementById('examProgressFill');
        const progressElapsed = document.getElementById('examProgressElapsed');
        const progressRemaining = document.getElementById('examProgressRemaining');
        const expectedEl = document.getElementById('examExpectedCount');
        const presentEl = document.getElementById('examPresentCount');

        if (dateEl) dateEl.textContent = formatROCDate();
        if (timeEl) timeEl.textContent = formatTime();

        const currentExam = getCurrentExam();
        const isExamTime = !!currentExam;

        // 更新提醒語（根據考試/休息時間）
        const reminders = isExamTime ? examReminders.exam : examReminders.break;
        if (reminderEl && reminders.length > 0) {
            if (currentReminderIndex >= reminders.length) {
                currentReminderIndex = 0;
            }
            reminderEl.textContent = reminders[currentReminderIndex] || '準備開始';
        }
        if (reminderCounterEl && reminders.length > 0) {
            reminderCounterEl.textContent = `${currentReminderIndex + 1} / ${reminders.length}`;
        }

        if (statusEl) {
            if (currentExam) {
                const remaining = getRemainingMinutes(currentExam);
                statusEl.innerHTML = `考試進行中<br><span class="exam-status-remaining">剩餘時間還有 ${remaining} 分鐘</span>`;
                statusEl.className = 'exam-status-bar';

                if (progressFill) {
                    const progress = getExamProgress(currentExam);
                    progressFill.style.width = progress + '%';
                    progressFill.classList.remove('warning', 'danger');
                    if (remaining <= 5) {
                        progressFill.classList.add('danger');
                    } else if (remaining <= 10) {
                        progressFill.classList.add('warning');
                    }
                }

                if (progressElapsed) {
                    const start = timeToMinutes(currentExam.startTime);
                    const current = timeToMinutes(getCurrentTimeString());
                    progressElapsed.textContent = `已進行 ${current - start} 分鐘`;
                }

                if (progressRemaining) {
                    progressRemaining.textContent = `剩餘 ${remaining} 分鐘`;
                }
            } else {
                const currentMinutes = timeToMinutes(getCurrentTimeString());
                const nextExam = examSubjects.find(s => timeToMinutes(s.startTime) > currentMinutes);

                if (nextExam) {
                    const waitMinutes = timeToMinutes(nextExam.startTime) - currentMinutes;
                    const mins = Math.floor(waitMinutes);
                    const now = new Date();
                    const secs = 60 - now.getSeconds();

                    // 選擇有趣的 emoji
                    const breakEmojis = ['☕', '🧘', '🎯', '📚', '💪', '🌟'];
                    const emojiIndex = Math.floor(now.getSeconds() / 10) % breakEmojis.length;

                    statusEl.innerHTML = `
                        <div class="exam-break-countdown">
                            <div class="exam-break-emoji">${breakEmojis[emojiIndex]}</div>
                            <div class="exam-break-message">距離 ${nextExam.name} 開始</div>
                            <div class="exam-break-time">
                                <div>
                                    <div class="exam-break-digit">${mins.toString().padStart(2, '0')}</div>
                                    <div class="exam-break-label">分鐘</div>
                                </div>
                                <div class="exam-break-separator">:</div>
                                <div>
                                    <div class="exam-break-digit">${secs.toString().padStart(2, '0')}</div>
                                    <div class="exam-break-label">秒</div>
                                </div>
                            </div>
                        </div>
                    `;
                    statusEl.className = 'exam-status-bar waiting';
                } else {
                    statusEl.innerHTML = `
                        <div class="exam-break-countdown">
                            <div class="exam-break-emoji">🎉</div>
                            <div class="exam-break-message">今日考試已結束！辛苦了！</div>
                        </div>
                    `;
                    statusEl.className = 'exam-status-bar finished';
                }

                // 休息時間也顯示進度條（到下一場考試的進度）
                if (progressFill && nextExam) {
                    // 計算上一場考試結束到下一場考試開始的休息時間進度
                    const prevExam = examSubjects.filter(s => timeToMinutes(s.endTime) <= currentMinutes).pop();
                    const breakStart = prevExam ? timeToMinutes(prevExam.endTime) : timeToMinutes(examSubjects[0].startTime) - 10;
                    const breakEnd = timeToMinutes(nextExam.startTime);
                    const breakTotal = breakEnd - breakStart;
                    const breakElapsed = currentMinutes - breakStart;
                    const breakProgress = breakTotal > 0 ? Math.min(100, (breakElapsed / breakTotal) * 100) : 0;

                    progressFill.style.width = breakProgress + '%';
                    progressFill.classList.remove('warning', 'danger');
                    progressFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
                } else if (progressFill) {
                    progressFill.style.width = '100%';
                    progressFill.classList.remove('warning', 'danger');
                    progressFill.style.background = 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)';
                }
                if (progressElapsed) progressElapsed.textContent = nextExam ? '休息中' : '已完成';
                if (progressRemaining) progressRemaining.textContent = nextExam ? `${Math.floor(timeToMinutes(nextExam.startTime) - currentMinutes)} 分鐘後開始` : '今日結束';
            }
        }

        if (expectedEl) expectedEl.textContent = examAttendance.expected;
        if (presentEl) presentEl.textContent = examAttendance.present;

        renderFullscreenSubjects();

        // === 音效提醒問卵 ===
        if (typeof ExamSounds !== 'undefined') {
            const _examForSound = getCurrentExam();
            const _remForSound = _examForSound ? getRemainingMinutes(_examForSound) : 0;
            ExamSounds.onExamTick(_examForSound, _remForSound, false);
        }
    }

    // ========================================
    // 管理操作函數
    // ========================================

    window.addExamSubject = function () {
        const nameInput = document.getElementById('examSubjectName');
        const startInput = document.getElementById('examSubjectStart');
        const endInput = document.getElementById('examSubjectEnd');

        const name = nameInput?.value.trim();
        const startTime = startInput?.value;
        const endTime = endInput?.value;

        if (!name) {
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.warning('請輸入科目名稱');
            return;
        }
        if (!startTime || !endTime) {
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.warning('請設定開始與結束時間');
            return;
        }
        if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.warning('結束時間必須晚於開始時間');
            return;
        }

        const newId = examSubjects.length > 0 ? Math.max(...examSubjects.map(s => s.id)) + 1 : 1;
        examSubjects.push({ id: newId, name, startTime, endTime });
        saveData();
        renderSubjectList();
        renderReminderPreview();

        nameInput.value = '';
        startInput.value = '';
        endInput.value = '';

        if (typeof NotificationSystem !== 'undefined') NotificationSystem.success(`已新增科目：${name}`);
    };

    window.deleteExamSubject = function (id) {
        if (!confirm('確定要刪除這個科目嗎？')) return;
        examSubjects = examSubjects.filter(s => s.id !== id);
        saveData();
        renderSubjectList();
        if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('科目已刪除');
    };

    window.editSubjectName = function (id) {
        const subject = examSubjects.find(s => s.id === id);
        if (!subject) return;

        const newName = prompt('請輸入新的科目名稱：', subject.name);
        if (newName && newName.trim() && newName.trim() !== subject.name) {
            subject.name = newName.trim();
            saveData();
            renderSubjectList();
            updateFullscreenStatus();
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.success(`科目已更新為：${newName.trim()}`);
        }
    };

    window.saveExamReminder = function () {
        const textarea = document.getElementById('examReminderText');
        if (textarea) {
            const reminder = textarea.value.trim();
            if (reminder && !examReminders.exam.includes(reminder)) {
                examReminders.exam.unshift(reminder);
                saveData();
                renderReminderPreview();
                textarea.value = '';
                if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('提醒語已儲存');
            }
        }
    };

    // ========================================
    // 淺色模式切換
    // ========================================

    window.toggleExamLightMode = function () {
        const modal = document.getElementById('examFullscreenModal');
        if (!modal) return;

        isLightMode = !isLightMode;
        modal.classList.toggle('light-mode', isLightMode);
        saveData();

        // 更新按鈕圖示
        const btn = document.getElementById('examLightModeBtn');
        if (btn) {
            btn.textContent = isLightMode ? '🌙' : '☀️';
            btn.title = isLightMode ? '切換深色模式' : '切換淺色模式';
        }
    };

    // ========================================
    // 時鐘模式切換（數位/類比）
    // ========================================

    window.toggleExamClockMode = function () {
        const modal = document.getElementById('examFullscreenModal');
        if (!modal) return;

        isAnalogClock = !isAnalogClock;
        modal.classList.toggle('analog-mode', isAnalogClock);
        localStorage.setItem('examAnalogClock', JSON.stringify(isAnalogClock));

        // 更新按鈕圖示
        const btn = document.getElementById('examClockModeBtn');
        if (btn) {
            btn.textContent = isAnalogClock ? '🔢' : '🕐';
            btn.title = isAnalogClock ? '切換數位時鐘' : '切換圓形時鐘';
        }

        // 如果是類比時鐘模式，初始化時鐘
        if (isAnalogClock) {
            initAnalogClock();
            updateAnalogClock();
        }
    };

    // 初始化類比時鐘（生成刻度和數字）
    function initAnalogClock() {
        const marksContainer = document.getElementById('examClockMarks');
        const numbersContainer = document.getElementById('examClockNumbers');

        if (!marksContainer || marksContainer.children.length > 0) return;

        // 生成 60 個刻度（只生成小時刻度，分鐘刻度太密集）
        for (let i = 0; i < 60; i++) {
            // 只生成每5分鐘的刻度（12個小時刻度）
            if (i % 5 === 0) {
                const mark = document.createElement('div');
                mark.className = 'exam-clock-mark hour-mark';
                mark.style.transform = `rotate(${i * 6}deg)`;
                marksContainer.appendChild(mark);
            }
        }

        // 生成 12 個數字
        if (numbersContainer && numbersContainer.children.length === 0) {
            const radius = 38; // 數字距離中心的百分比
            for (let i = 1; i <= 12; i++) {
                const number = document.createElement('div');
                number.className = 'exam-clock-number';
                const angle = (i * 30 - 90) * (Math.PI / 180);
                const x = 50 + radius * Math.cos(angle);
                const y = 50 + radius * Math.sin(angle);
                number.style.left = x + '%';
                number.style.top = y + '%';
                number.textContent = i;
                numbersContainer.appendChild(number);
            }
        }
    }

    // 更新類比時鐘指針
    function updateAnalogClock() {
        const now = new Date();
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();

        const hourHand = document.getElementById('examHourHand');
        const minuteHand = document.getElementById('examMinuteHand');
        const secondHand = document.getElementById('examSecondHand');
        const analogDate = document.getElementById('examAnalogDate');

        // 時針：每小時30度 + 每分鐘0.5度
        if (hourHand) {
            const hourDeg = (hours * 30) + (minutes * 0.5);
            hourHand.style.transform = `translateY(-100%) rotate(${hourDeg}deg)`;
        }

        // 分針：每分鐘6度 + 每秒0.1度
        if (minuteHand) {
            const minuteDeg = (minutes * 6) + (seconds * 0.1);
            minuteHand.style.transform = `translateY(-100%) rotate(${minuteDeg}deg)`;
        }

        // 秒針：每秒6度（加上毫秒讓動畫更順滑）
        if (secondHand) {
            const secondDeg = (seconds * 6) + (milliseconds * 0.006);
            secondHand.style.transform = `translateY(-100%) rotate(${secondDeg}deg)`;
        }

        if (analogDate) {
            analogDate.textContent = formatROCDate();
        }
    }

    // 確保在每秒更新時也更新類比時鐘
    const originalUpdateFullscreenStatus = updateFullscreenStatus;
    updateFullscreenStatus = function () {
        originalUpdateFullscreenStatus();
        if (isAnalogClock) {
            updateAnalogClock();
        }
    };

    // 暴露際需給音效模組使用的 helper
    window.getCurrentExam = getCurrentExam;
    window.getRemainingMinutes = getRemainingMinutes;


    // ========================================
    // 點擊輸入人數功能
    // ========================================

    window.editExamAttendance = function (field) {
        const currentValue = examAttendance[field] || 0;
        const label = field === 'expected' ? '應到人數' : '實到人數';
        const newValue = prompt(`請輸入${label}：`, currentValue);

        if (newValue !== null) {
            const num = parseInt(newValue);
            if (!isNaN(num) && num >= 0) {
                examAttendance[field] = num;
                saveData();
                updateFullscreenStatus();
            }
        }
    };

    window.setExamExpected = function () {
        const expected = prompt('請輸入應到人數：', examAttendance.expected);
        if (expected !== null) {
            examAttendance.expected = Math.max(0, parseInt(expected) || 0);
            const present = prompt('請輸入實到人數：', examAttendance.present);
            if (present !== null) {
                examAttendance.present = Math.max(0, parseInt(present) || 0);
            }
            saveData();
            updateFullscreenStatus();
        }
    };

    // ========================================
    // 時間選擇器
    // ========================================

    let activeTimePicker = null;

    window.openTimePicker = function (subjectId, timeType, event) {
        event.stopPropagation();
        if (activeTimePicker) activeTimePicker.remove();
        showTimePicker(subjectId, timeType, event);
    };

    window.openSubjectTimePicker = function (subjectId, timeType, event) {
        event.stopPropagation();
        if (activeTimePicker) activeTimePicker.remove();
        showTimePicker(subjectId, timeType, event);
    };

    function showTimePicker(subjectId, timeType, event) {
        const subject = examSubjects.find(s => s.id === subjectId);
        if (!subject) return;

        const currentTime = timeType === 'start' ? subject.startTime : subject.endTime;
        const [currentHour, currentMin] = currentTime.split(':').map(Number);

        const picker = document.createElement('div');
        picker.className = 'exam-time-picker active';
        picker.innerHTML = `
            <div class="exam-time-picker-header">${timeType === 'start' ? '開始時間' : '結束時間'}</div>
            <div style="display: flex; gap: 0.5rem;">
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.25rem; text-align: center;">時</div>
                    <div class="exam-time-picker-grid" id="hourPicker" style="grid-template-columns: repeat(3, 1fr); max-height: 150px; overflow-y: auto;">
                        ${Array.from({ length: 12 }, (_, i) => i + 7).map(h =>
            `<button class="exam-time-picker-btn ${h === currentHour ? 'selected' : ''}" data-hour="${h}">${h.toString().padStart(2, '0')}</button>`
        ).join('')}
                    </div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 0.25rem; text-align: center;">分</div>
                    <div class="exam-time-picker-grid" id="minPicker" style="grid-template-columns: repeat(3, 1fr); max-height: 150px; overflow-y: auto;">
                        ${Array.from({ length: 12 }, (_, i) => i * 5).map(m =>
            `<button class="exam-time-picker-btn ${m === currentMin ? 'selected' : ''}" data-min="${m}">${m.toString().padStart(2, '0')}</button>`
        ).join('')}
                    </div>
                </div>
            </div>
            <button style="width: 100%; margin-top: 0.75rem; padding: 0.5rem; background: #14b8a6; color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 500;" onclick="confirmTimePicker(${subjectId}, '${timeType}')">確定</button>
        `;

        document.body.appendChild(picker);
        activeTimePicker = picker;

        // 使用 requestAnimationFrame 確保 DOM 完成渲染後再計算位置
        requestAnimationFrame(() => {
            const rect = event.target.getBoundingClientRect();
            const pickerRect = picker.getBoundingClientRect();
            const pickerHeight = pickerRect.height;
            const pickerWidth = pickerRect.width;
            const margin = 10;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            // 計算水平位置
            let left = rect.left;
            if (left + pickerWidth > viewportWidth - margin) {
                left = viewportWidth - pickerWidth - margin;
            }
            left = Math.max(margin, left);

            // 計算垂直位置
            const spaceBelow = viewportHeight - rect.bottom - margin;
            const spaceAbove = rect.top - margin;
            let top;

            if (spaceBelow >= pickerHeight) {
                // 下方空間足夠
                top = rect.bottom + 5;
            } else if (spaceAbove >= pickerHeight) {
                // 上方空間足夠，往上顯示
                top = rect.top - pickerHeight - 5;
            } else {
                // 空間都不夠，將選擇器定位在視窗中央並加入滾動
                top = Math.max(margin, (viewportHeight - pickerHeight) / 2);
                picker.style.maxHeight = `${viewportHeight - margin * 2}px`;
            }

            // 確保不會超出視窗頂部
            top = Math.max(margin, top);
            // 確保不會超出視窗底部
            if (top + pickerHeight > viewportHeight - margin) {
                top = viewportHeight - pickerHeight - margin;
                top = Math.max(margin, top);
            }

            picker.style.left = `${left}px`;
            picker.style.top = `${top}px`;
        });

        setTimeout(() => {
            document.addEventListener('click', closeTimePickerOnOutsideClick);
        }, 100);
    }

    function closeTimePickerOnOutsideClick(event) {
        if (activeTimePicker && !activeTimePicker.contains(event.target)) {
            activeTimePicker.remove();
            activeTimePicker = null;
            document.removeEventListener('click', closeTimePickerOnOutsideClick);
        }
    }

    window.confirmTimePicker = function (subjectId, timeType) {
        const subject = examSubjects.find(s => s.id === subjectId);
        if (!subject || !activeTimePicker) return;

        const selectedHour = activeTimePicker.querySelector('#hourPicker .selected');
        const selectedMin = activeTimePicker.querySelector('#minPicker .selected');

        if (selectedHour && selectedMin) {
            const hour = selectedHour.dataset.hour.padStart(2, '0');
            const min = selectedMin.dataset.min.padStart(2, '0');
            const newTime = `${hour}:${min}`;

            if (timeType === 'start') {
                subject.startTime = newTime;
            } else {
                subject.endTime = newTime;
            }

            saveData();
            renderSubjectList();
            updateFullscreenStatus();
        }

        activeTimePicker.remove();
        activeTimePicker = null;
        document.removeEventListener('click', closeTimePickerOnOutsideClick);
    };

    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('exam-time-picker-btn')) {
            const picker = e.target.closest('.exam-time-picker');
            if (!picker) return;
            const parent = e.target.parentElement;
            parent.querySelectorAll('.exam-time-picker-btn').forEach(btn => btn.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    });

    // ========================================
    // 設定提醒面板
    // ========================================

    window.openExamSettings = function () {
        let panel = document.getElementById('examSettingsPanel');
        if (!panel) {
            createSettingsPanel();
            panel = document.getElementById('examSettingsPanel');
        }
        renderSettingsReminders();
        panel.classList.add('active');
    };

    window.closeExamSettings = function () {
        const panel = document.getElementById('examSettingsPanel');
        if (panel) {
            panel.classList.remove('active');
            renderReminderPreview();
        }
    };

    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'examSettingsPanel';
        panel.className = 'exam-settings-panel';
        panel.innerHTML = `
            <div class="exam-settings-content">
                <div class="exam-settings-header">
                    <div class="exam-settings-title">設定提醒內容與順序</div>
                    <button class="exam-settings-close" onclick="closeExamSettings()">關閉</button>
                </div>
                <div class="exam-settings-body">
                    <div class="exam-settings-column">
                        <div class="exam-settings-column-header">
                            <div class="exam-settings-column-title exam-type">考試中提醒 (<span id="examReminderCount">0</span>則)</div>
                            <button class="exam-settings-add-btn" onclick="addExamReminderItem('exam')">+</button>
                        </div>
                        <div class="exam-reminder-list" id="examReminderListEdit" data-type="exam"></div>
                    </div>
                    <div class="exam-settings-column">
                        <div class="exam-settings-column-header">
                            <div class="exam-settings-column-title break-type">下課/休息提醒 (<span id="breakReminderCount">0</span>則)</div>
                            <button class="exam-settings-add-btn" onclick="addExamReminderItem('break')">+</button>
                        </div>
                        <div class="exam-reminder-list" id="breakReminderListEdit" data-type="break"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        panel.addEventListener('click', function (e) {
            if (e.target === panel) closeExamSettings();
        });
    }

    function renderSettingsReminders() {
        ['exam', 'break'].forEach(type => {
            const list = document.getElementById(type + 'ReminderListEdit');
            const countEl = document.getElementById(type + 'ReminderCount');
            if (!list) return;

            const items = examReminders[type] || [];
            if (countEl) countEl.textContent = items.length;

            list.innerHTML = items.map((text, index) => `
                <div class="exam-reminder-item" draggable="true" data-index="${index}" data-type="${type}">
                    <span class="exam-reminder-drag">↕</span>
                    <div class="exam-reminder-input" contenteditable="true" 
                        onblur="updateReminderText('${type}', ${index}, this.textContent)"
                        title="點擊編輯">${escapeHtml(text)}</div>
                    <button class="exam-reminder-delete" onclick="deleteReminderItem('${type}', ${index})">🗑️</button>
                </div>
            `).join('');

            enableDragSort(list, type);
        });
    }

    function enableDragSort(list, type) {
        let draggedItem = null;

        list.addEventListener('dragstart', function (e) {
            draggedItem = e.target.closest('.exam-reminder-item');
            if (draggedItem) draggedItem.classList.add('dragging');
        });

        list.addEventListener('dragend', function (e) {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                const newOrder = [...list.querySelectorAll('.exam-reminder-item')].map(item =>
                    examReminders[type][parseInt(item.dataset.index)]
                );
                examReminders[type] = newOrder;
                saveData();
                renderSettingsReminders();
            }
            draggedItem = null;
        });

        list.addEventListener('dragover', function (e) {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            if (draggedItem) {
                if (afterElement) list.insertBefore(draggedItem, afterElement);
                else list.appendChild(draggedItem);
            }
        });
    }

    function getDragAfterElement(container, y) {
        const elements = [...container.querySelectorAll('.exam-reminder-item:not(.dragging)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    window.addExamReminderItem = function (type) {
        const newText = prompt('請輸入新的提醒內容：');
        if (newText && newText.trim()) {
            examReminders[type].push(newText.trim());
            saveData();
            renderSettingsReminders();
        }
    };

    window.updateReminderText = function (type, index, newText) {
        if (newText.trim()) {
            examReminders[type][index] = newText.trim();
            saveData();
        }
    };

    window.deleteReminderItem = function (type, index) {
        if (confirm('確定要刪除這則提醒嗎？')) {
            examReminders[type].splice(index, 1);
            saveData();
            renderSettingsReminders();
        }
    };

    // ========================================
    // 全螢幕模式
    // ========================================

    window.openExamFullscreen = function () {
        const modal = document.getElementById('examFullscreenModal');
        if (!modal) return;

        // 動態新增時鐘切換按鈕（如果不存在）
        injectClockModeButton();

        // 動態新增缺考記錄按鈕（如果不存在）
        injectAbsenceButton();

        // 動態新增類比時鐘 HTML（如果不存在）
        injectAnalogClockHTML();

        modal.classList.add('active');
        modal.classList.toggle('light-mode', isLightMode);
        modal.classList.toggle('analog-mode', isAnalogClock);
        document.body.style.overflow = 'hidden';

        const noteInput = document.getElementById('examAbsentNote');
        if (noteInput) noteInput.value = examAttendance.absentNote;

        // 更新淺色模式按鈕
        const lightBtn = document.getElementById('examLightModeBtn');
        if (lightBtn) {
            lightBtn.textContent = isLightMode ? '🌙' : '☀️';
            lightBtn.title = isLightMode ? '切換深色模式' : '切換淺色模式';
        }

        // 更新時鐘模式按鈕
        const clockBtn = document.getElementById('examClockModeBtn');
        if (clockBtn) {
            clockBtn.textContent = isAnalogClock ? '🔢' : '🕐';
            clockBtn.title = isAnalogClock ? '切換數位時鐘' : '切換圓形時鐘';
        }

        // 如果是類比時鐘模式，初始化時鐘
        if (isAnalogClock) {
            initAnalogClock();
            updateAnalogClock();
        }

        currentReminderIndex = 0;
        updateFullscreenStatus();

        examClockInterval = setInterval(updateFullscreenStatus, 1000);

        reminderRotationInterval = setInterval(() => {
            const currentExam = getCurrentExam();
            const reminders = currentExam ? examReminders.exam : examReminders.break;
            if (reminders.length > 0) {
                currentReminderIndex = (currentReminderIndex + 1) % reminders.length;
                updateFullscreenStatus();
            }
        }, 10000);
    };

    // 動態插入時鐘切換按鈕
    function injectClockModeButton() {
        if (document.getElementById('examClockModeBtn')) return;

        const controls = document.querySelector('.exam-fullscreen-controls');
        if (!controls) return;

        const btn = document.createElement('button');
        btn.id = 'examClockModeBtn';
        btn.className = 'exam-control-btn';
        btn.onclick = window.toggleExamClockMode;
        btn.title = isAnalogClock ? '切換數位時鐘' : '切換圓形時鐘';
        btn.textContent = isAnalogClock ? '🔢' : '🕐';
        controls.appendChild(btn);
    }

    // 動態插入缺考記錄按鈕
    function injectAbsenceButton() {
        if (document.getElementById('examAbsenceBtn')) return;

        const controls = document.querySelector('.exam-fullscreen-controls');
        if (!controls) return;

        const btn = document.createElement('button');
        btn.id = 'examAbsenceBtn';
        btn.className = 'exam-control-btn';
        btn.onclick = () => openAbsenceManager();
        btn.title = '缺考學生記錄';
        btn.textContent = '📋';
        controls.appendChild(btn);
    }

    // 動態插入類比時鐘 HTML
    function injectAnalogClockHTML() {
        if (document.getElementById('examAnalogClock')) return;

        const clockArea = document.querySelector('.exam-clock-area');
        if (!clockArea) return;

        // 創建類比時鐘容器
        const analogClock = document.createElement('div');
        analogClock.id = 'examAnalogClock';
        analogClock.className = 'exam-analog-clock';
        analogClock.innerHTML = `
            <div class="exam-clock-marks" id="examClockMarks"></div>
            <div class="exam-clock-numbers" id="examClockNumbers"></div>
            <div id="examHourHand" class="exam-clock-hand-hour"></div>
            <div id="examMinuteHand" class="exam-clock-hand-minute"></div>
            <div id="examSecondHand" class="exam-clock-hand-second"></div>
            <div class="exam-clock-center"></div>
        `;
        clockArea.appendChild(analogClock);

        // 創建類比模式下的日期顯示
        const analogDate = document.createElement('div');
        analogDate.id = 'examAnalogDate';
        analogDate.className = 'exam-analog-date';
        analogDate.textContent = formatROCDate();
        clockArea.appendChild(analogDate);
    }

    window.closeExamFullscreen = function () {
        const modal = document.getElementById('examFullscreenModal');
        if (!modal) return;

        const noteInput = document.getElementById('examAbsentNote');
        if (noteInput) {
            examAttendance.absentNote = noteInput.value;
            saveData();
        }

        modal.classList.remove('active');
        document.body.style.overflow = '';

        if (examClockInterval) { clearInterval(examClockInterval); examClockInterval = null; }
        if (reminderRotationInterval) { clearInterval(reminderRotationInterval); reminderRotationInterval = null; }
    };

    // ========================================
    // 時間衝突檢測功能
    // ========================================

    /**
     * 解析時間字串為分鐘數
     */
    function parseTimeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * 檢測兩個時間段是否衝突
     */
    function isTimeConflict(subject1, subject2) {
        const start1 = parseTimeToMinutes(subject1.startTime);
        const end1 = parseTimeToMinutes(subject1.endTime);
        const start2 = parseTimeToMinutes(subject2.startTime);
        const end2 = parseTimeToMinutes(subject2.endTime);

        // 時間重疊判斷
        return start1 < end2 && end1 > start2;
    }

    /**
     * 檢測科目時間衝突
     * @param {Object} newSubject - 要檢測的科目
     * @param {Array} existingSubjects - 現有科目列表
     * @returns {Array} 衝突的科目列表
     */
    function checkTimeConflicts(newSubject, existingSubjects) {
        const conflicts = [];

        existingSubjects.forEach(subject => {
            if (subject.id === newSubject.id) return; // 跳過自己

            if (isTimeConflict(newSubject, subject)) {
                conflicts.push({
                    id: subject.id,
                    name: subject.name,
                    time: `${subject.startTime}-${subject.endTime}`
                });
            }
        });

        return conflicts;
    }

    /**
     * 顯示時間衝突警告
     */
    function showConflictWarning(conflicts, subjectName) {
        const conflictNames = conflicts.map(c => `${c.name} (${c.time})`).join('、');
        const message = `⚠️ 時間衝突警告\n\n「${subjectName}」與以下科目時間重疊：\n${conflictNames}\n\n是否仍要儲存？`;
        return confirm(message);
    }

    /**
     * 取得所有衝突的科目配對
     */
    function getAllConflicts() {
        const allConflicts = [];

        for (let i = 0; i < examSubjects.length; i++) {
            for (let j = i + 1; j < examSubjects.length; j++) {
                if (isTimeConflict(examSubjects[i], examSubjects[j])) {
                    allConflicts.push({
                        subject1: examSubjects[i],
                        subject2: examSubjects[j]
                    });
                }
            }
        }

        return allConflicts;
    }

    /**
     * 渲染衝突指示器到科目列表
     */
    function addConflictIndicators() {
        const conflicts = getAllConflicts();
        const conflictIds = new Set();

        conflicts.forEach(c => {
            conflictIds.add(c.subject1.id);
            conflictIds.add(c.subject2.id);
        });

        document.querySelectorAll('.exam-subject-item').forEach(item => {
            const id = parseInt(item.dataset.id);
            const indicator = item.querySelector('.conflict-indicator');

            if (conflictIds.has(id)) {
                if (!indicator) {
                    const badge = document.createElement('span');
                    badge.className = 'conflict-indicator';
                    badge.innerHTML = '⚠️';
                    badge.title = '此科目與其他科目時間衝突';
                    badge.style.cssText = 'margin-left: 0.5rem; cursor: pointer; animation: pulse-warning 1s ease-in-out infinite;';
                    badge.onclick = (e) => {
                        e.stopPropagation();
                        showConflictDetails(id);
                    };
                    item.querySelector('.exam-subject-name')?.parentNode.appendChild(badge);
                }
            } else if (indicator) {
                indicator.remove();
            }
        });
    }

    /**
     * 顯示衝突詳情
     */
    function showConflictDetails(subjectId) {
        const subject = examSubjects.find(s => s.id === subjectId);
        if (!subject) return;

        const conflicts = checkTimeConflicts(subject, examSubjects);
        const details = conflicts.map(c => `• ${c.name}: ${c.time}`).join('\n');

        alert(`「${subject.name}」(${subject.startTime}-${subject.endTime}) 與以下科目時間衝突：\n\n${details}`);
    }

    // ========================================
    // 缺考學生記錄功能
    // ========================================

    /**
     * 取得今日考試記錄 ID
     */
    function getTodayExamId() {
        const today = new Date();
        return `exam_${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    }

    /**
     * 取得或建立今日缺考記錄
     */
    function getTodayAbsenceRecord() {
        const examId = getTodayExamId();
        let record = absenceRecords.find(r => r.examId === examId);

        if (!record) {
            record = {
                examId: examId,
                date: new Date().toISOString().split('T')[0],
                subjects: []
            };
            absenceRecords.push(record);
        }

        return record;
    }

    /**
     * 取得特定科目的缺考記錄
     */
    function getSubjectAbsences(subjectId) {
        const record = getTodayAbsenceRecord();
        let subjectRecord = record.subjects.find(s => s.subjectId === subjectId);

        if (!subjectRecord) {
            const subject = examSubjects.find(s => s.id === subjectId);
            subjectRecord = {
                subjectId: subjectId,
                subjectName: subject?.name || '未知科目',
                absences: []
            };
            record.subjects.push(subjectRecord);
        }

        return subjectRecord;
    }

    /**
     * 新增缺考學生
     */
    window.addAbsentStudent = function (subjectId, studentName, absenceType, note) {
        const subjectRecord = getSubjectAbsences(subjectId);

        // 檢查是否已存在
        if (subjectRecord.absences.find(a => a.name === studentName)) {
            showNotification('此學生已在缺考名單中', 'warning');
            return false;
        }

        subjectRecord.absences.push({
            id: Date.now(),
            name: studentName,
            type: absenceType || 'other',
            note: note || '',
            timestamp: new Date().toISOString()
        });

        saveAbsenceRecords();
        syncFullscreenAttendance(subjectId); // 同步全螢幕模式（傳遞科目 ID）
        showNotification(`已記錄 ${studentName} 缺考`, 'success');
        return true;
    };

    /**
     * 移除缺考學生
     */
    window.removeAbsentStudent = function (subjectId, absenceId) {
        const subjectRecord = getSubjectAbsences(subjectId);
        const index = subjectRecord.absences.findIndex(a => a.id === absenceId);

        if (index > -1) {
            const removed = subjectRecord.absences.splice(index, 1)[0];
            saveAbsenceRecords();
            syncFullscreenAttendance(subjectId); // 同步全螢幕模式（傳遞科目 ID）
            showNotification(`已移除 ${removed.name}`, 'info');
            return true;
        }
        return false;
    };

    /**
     * 儲存缺考記錄
     */
    function saveAbsenceRecords() {
        localStorage.setItem('examAbsenceRecords', JSON.stringify(absenceRecords));
    }

    /**
     * 同步全螢幕模式的出席人數
     * @param {number} subjectId - 科目 ID（可選，預設為當前科目）
     */
    function syncFullscreenAttendance(subjectId) {
        // 取得指定科目的缺考人數（若未提供則用當前科目）
        const targetExam = subjectId ?
            examSubjects.find(s => s.id === subjectId) :
            (getCurrentExam() || examSubjects[0]);
        if (!targetExam) return;

        const subjectRecord = getSubjectAbsences(targetExam.id);
        const absentCount = subjectRecord.absences.length;

        // 更新 examAttendance
        const totalStudents = getStudentCount();
        examAttendance.expected = totalStudents;
        examAttendance.present = totalStudents - absentCount;
        saveData();

        // 更新全螢幕顯示 (使用 ID 選擇器)
        const expectedEl = document.getElementById('examExpectedCount');
        const presentEl = document.getElementById('examPresentCount');

        if (expectedEl) expectedEl.textContent = totalStudents;
        if (presentEl) presentEl.textContent = totalStudents - absentCount;
    }

    /**
     * 取得學生總數
     */
    function getStudentCount() {
        if (typeof AppState !== 'undefined' && AppState.students && AppState.students.length > 0) {
            return AppState.students.length;
        } else if (window.students && window.students.length > 0) {
            return window.students.length;
        } else {
            try {
                const savedStudents = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students') || '[]');
                return savedStudents.length;
            } catch (e) {
                return examAttendance.expected || 0;
            }
        }
    }

    /**
     * 開啟缺考學生管理面板
     */
    window.openAbsenceManager = function (subjectId) {
        const currentSubject = subjectId ?
            examSubjects.find(s => s.id === subjectId) :
            getCurrentExam() || examSubjects[0];

        if (!currentSubject) {
            showNotification('請先新增考試科目', 'warning');
            return;
        }

        const subjectRecord = getSubjectAbsences(currentSubject.id);

        // 從多個來源取得學生名單
        let students = [];
        if (typeof AppState !== 'undefined' && AppState.students && AppState.students.length > 0) {
            students = AppState.students;
        } else if (window.students && window.students.length > 0) {
            students = window.students;
        } else {
            // 嘗試從 localStorage 讀取
            try {
                const savedStudents = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students') || '[]');
                students = savedStudents;
            } catch (e) {
                console.warn('[AbsenceManager] 無法讀取學生名單');
            }
        }

        // 排序學生（按座號）
        students = [...students].sort((a, b) => (a.number || 0) - (b.number || 0));

        // 創建面板
        let panel = document.getElementById('absenceManagerPanel');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'absenceManagerPanel';
        panel.className = 'absence-manager-panel';
        panel.innerHTML = `
            <div class="absence-manager-overlay" onclick="closeAbsenceManager()"></div>
            <div class="absence-manager-content">
                <div class="absence-manager-header">
                    <h3>📋 缺考學生記錄</h3>
                    <div class="absence-subject-selector">
                        <select id="absenceSubjectSelect" onchange="switchAbsenceSubject(this.value)">
                            ${examSubjects.map(s => `
                                <option value="${s.id}" ${s.id === currentSubject.id ? 'selected' : ''}>
                                    ${escapeHtml(s.name)} (${s.startTime}-${s.endTime})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <button class="absence-manager-close" onclick="closeAbsenceManager()">✕</button>
                </div>
                
                <div class="absence-manager-body">
                    <div class="absence-add-section">
                        <h4>新增缺考學生</h4>
                        <div class="absence-add-form">
                            <select id="absenceStudentSelect" class="absence-input">
                                <option value="">-- 選擇學生 --</option>
                                ${students.map(s => `<option value="${escapeHtml(s.name)}">${s.number ? s.number + '. ' : ''}${escapeHtml(s.name)}</option>`).join('')}
                            </select>
                            <input type="text" id="absenceStudentName" class="absence-input" placeholder="或直接輸入姓名">
                            <select id="absenceTypeSelect" class="absence-input">
                                ${Object.entries(AbsenceTypes).map(([key, val]) =>
            `<option value="${key}">${val.icon} ${val.label}</option>`
        ).join('')}
                            </select>
                            <input type="text" id="absenceNote" class="absence-input" placeholder="備註（選填）">
                            <button class="absence-add-btn" onclick="submitAbsentStudent()">➕ 新增</button>
                        </div>
                    </div>
                    
                    <div class="absence-list-section">
                        <h4>已記錄缺考學生 (<span id="absenceCount">${subjectRecord.absences.length}</span>人)</h4>
                        <div class="absence-list" id="absenceList">
                            ${renderAbsenceList(currentSubject.id)}
                        </div>
                    </div>
                    
                    <div class="absence-stats-section">
                        <div class="absence-stat">
                            <span class="stat-label">應到人數</span>
                            <span class="stat-value" id="absenceStatsExpected">${students.length || '未設定'}</span>
                        </div>
                        <div class="absence-stat">
                            <span class="stat-label">實到人數</span>
                            <span class="stat-value" id="absenceStatsPresent">${students.length - subjectRecord.absences.length}</span>
                        </div>
                        <div class="absence-stat">
                            <span class="stat-label">出席率</span>
                            <span class="stat-value" id="absenceStatsRate">${students.length ?
                Math.round(((students.length - subjectRecord.absences.length) / students.length) * 100) + '%' :
                '-'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="absence-manager-footer">
                    <button class="absence-export-btn" onclick="exportAbsenceReport()">📤 匯出報告</button>
                    <button class="absence-close-btn" onclick="closeAbsenceManager()">關閉</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // 綁定下拉選單事件
        const studentSelect = document.getElementById('absenceStudentSelect');
        const studentInput = document.getElementById('absenceStudentName');
        if (studentSelect && studentInput) {
            studentSelect.onchange = () => {
                if (studentSelect.value) {
                    studentInput.value = studentSelect.value;
                }
            };
        }
    };

    /**
     * 渲染缺考學生列表
     */
    function renderAbsenceList(subjectId) {
        const subjectRecord = getSubjectAbsences(subjectId);

        if (subjectRecord.absences.length === 0) {
            return '<div class="absence-empty">目前沒有缺考記錄</div>';
        }

        return subjectRecord.absences.map(absence => {
            const typeInfo = AbsenceTypes[absence.type] || AbsenceTypes.other;
            return `
                <div class="absence-item" data-id="${absence.id}">
                    <span class="absence-type-icon" style="color: ${typeInfo.color}">${typeInfo.icon}</span>
                    <span class="absence-name">${escapeHtml(absence.name)}</span>
                    <span class="absence-type-label">${typeInfo.label}</span>
                    ${absence.note ? `<span class="absence-note">${escapeHtml(absence.note)}</span>` : ''}
                    <button class="absence-remove-btn" onclick="removeAbsentStudent(${subjectId}, ${absence.id}); refreshAbsenceList(${subjectId});">🗑️</button>
                </div>
            `;
        }).join('');
    }

    /**
     * 刷新缺考列表
     */
    window.refreshAbsenceList = function (subjectId) {
        const list = document.getElementById('absenceList');
        const count = document.getElementById('absenceCount');
        const subjectRecord = getSubjectAbsences(subjectId);

        if (list) list.innerHTML = renderAbsenceList(subjectId);
        if (count) count.textContent = subjectRecord.absences.length;

        // 更新統計區
        const totalStudents = getStudentCount();
        const absentCount = subjectRecord.absences.length;
        const presentCount = totalStudents - absentCount;
        const attendanceRate = totalStudents ? Math.round((presentCount / totalStudents) * 100) : 0;

        const expectedEl = document.getElementById('absenceStatsExpected');
        const presentEl = document.getElementById('absenceStatsPresent');
        const rateEl = document.getElementById('absenceStatsRate');

        if (expectedEl) expectedEl.textContent = totalStudents || '未設定';
        if (presentEl) presentEl.textContent = presentCount;
        if (rateEl) rateEl.textContent = totalStudents ? attendanceRate + '%' : '-';
    };

    /**
     * 切換缺考記錄科目
     */
    window.switchAbsenceSubject = function (subjectId) {
        const id = parseInt(subjectId);
        refreshAbsenceList(id);
    };

    /**
     * 提交缺考學生
     */
    window.submitAbsentStudent = function () {
        const subjectSelect = document.getElementById('absenceSubjectSelect');
        const studentInput = document.getElementById('absenceStudentName');
        const typeSelect = document.getElementById('absenceTypeSelect');
        const noteInput = document.getElementById('absenceNote');

        const subjectId = parseInt(subjectSelect?.value);
        const studentName = studentInput?.value?.trim();
        const absenceType = typeSelect?.value || 'other';
        const note = noteInput?.value?.trim();

        if (!studentName) {
            showNotification('請輸入或選擇學生姓名', 'warning');
            return;
        }

        if (addAbsentStudent(subjectId, studentName, absenceType, note)) {
            // 清空輸入
            if (studentInput) studentInput.value = '';
            if (noteInput) noteInput.value = '';
            const studentSelect = document.getElementById('absenceStudentSelect');
            if (studentSelect) studentSelect.value = '';

            // 刷新列表
            refreshAbsenceList(subjectId);
        }
    };

    /**
     * 關閉缺考管理面板
     */
    window.closeAbsenceManager = function () {
        const panel = document.getElementById('absenceManagerPanel');
        if (panel) panel.remove();
    };

    /**
     * 匯出缺考報告
     */
    window.exportAbsenceReport = function () {
        const record = getTodayAbsenceRecord();

        let report = `缺考記錄報告\n`;
        report += `日期：${record.date}\n`;
        report += `=`.repeat(40) + '\n\n';

        record.subjects.forEach(s => {
            report += `【${s.subjectName}】\n`;
            if (s.absences.length === 0) {
                report += '  (無缺考)\n';
            } else {
                s.absences.forEach(a => {
                    const typeInfo = AbsenceTypes[a.type] || AbsenceTypes.other;
                    report += `  • ${a.name} - ${typeInfo.label}${a.note ? ` (${a.note})` : ''}\n`;
                });
            }
            report += '\n';
        });

        // 下載文件
        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `缺考記錄_${record.date}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('報告已匯出', 'success');
    };

    // ========================================
    // 初始化
    // ========================================

    function injectStyles() {
        if (document.getElementById('exam-proctor-styles')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'exam-proctor-styles';
        styleEl.textContent = examStyles;
        document.head.appendChild(styleEl);
    }

    function init() {
        injectStyles();

        const checkReady = setInterval(() => {
            const subjectList = document.getElementById('examSubjectList');
            const reminderText = document.getElementById('examReminderText');

            if (subjectList) {
                clearInterval(checkReady);
                renderSubjectList();
                renderReminderPreview();
                if (reminderText && examReminders.exam.length > 0) {
                    reminderText.placeholder = examReminders.exam[0];
                }
                console.log('✅ 考試監考系統模組 v4 已載入');
            }
        }, 100);

        setTimeout(() => clearInterval(checkReady), 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
