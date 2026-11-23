/**
 * 考試音效提醒系統 v1.0
 * Exam Sound Notification System
 *
 * 使用 Web Audio API 合成鈴聲，無需任何外部音效檔案
 * 支援：考試開始、倒數 5 分鐘警告、1 分鐘緊急、考試結束、計時器到期
 */

(function () {
    'use strict';

    // =============================================
    // 核心設定
    // =============================================

    const SOUNDS_STORAGE_KEY = 'examSoundsEnabled';

    const ExamSounds = {
        _ctx: null,
        _enabled: localStorage.getItem(SOUNDS_STORAGE_KEY) !== 'false', // 預設開啟

        // 已經響過的鈴聲（「日期｜科目編號｜哪一種鈴」），同一科同一種鈴一天只響一次。
        // 多日考試每天第一科的編號都是 1，所以一定要帶日期，不然第二天的鈴會被當成響過了。
        _rung: {},

        /** 這一科的這種鈴今天還沒響過就記下來並回傳 true。 */
        _once(kind, exam) {
            const d = new Date();
            const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '|' + exam.id + '|' + kind;
            if (this._rung[key]) return false;
            this._rung[key] = true;
            return true;
        },

        /** 在老師按按鈕的當下先把聲音打開（瀏覽器規定要有點擊才能出聲）。 */
        unlock() {
            const ctx = this._getCtx();
            if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* 等下一次點擊 */ } }
        },

        // =============================================
        // AudioContext 懶初始化（需要使用者互動後才能建立）
        // =============================================

        _getCtx() {
            if (this._ctx && this._ctx.state !== 'closed') {
                if (this._ctx.state === 'suspended') {
                    this._ctx.resume();
                }
                return this._ctx;
            }
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
                return this._ctx;
            } catch (e) {
                console.warn('[ExamSounds] AudioContext 建立失敗：', e);
                return null;
            }
        },

        // =============================================
        // 基礎音效合成引擎
        // =============================================

        /**
         * 播放一組音符序列
         * @param {Array} notes - [{freq, duration, type}] 陣列
         * @param {number} startDelay - 起始延遲（秒）
         */
        _playNotes(notes, startDelay = 0) {
            if (!this._enabled) return;
            const ctx = this._getCtx();
            if (!ctx) return;

            let time = ctx.currentTime + startDelay;

            notes.forEach(({ freq, duration, type = 'sine', volume = 0.4, attack = 0.01, decay = 0.3 }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = type;
                osc.frequency.setValueAtTime(freq, time);

                // Attack
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(volume, time + attack);
                // Decay
                gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

                osc.start(time);
                osc.stop(time + duration + 0.05);

                time += duration * decay;
            });
        },

        // =============================================
        // 預設音效套件
        // =============================================

        /**
         * 🔔 考試開始鈴（三聲上揚）
         */
        playStart() {
            this._playNotes([
                { freq: 523, duration: 0.2, type: 'sine', volume: 0.35, decay: 0.9 },
                { freq: 659, duration: 0.2, type: 'sine', volume: 0.35, decay: 0.9 },
                { freq: 784, duration: 0.4, type: 'sine', volume: 0.4, decay: 0.9 },
            ]);
        },

        /**
         * ⚠️ 倒數 5 分鐘警告（雙響提示）
         */
        playFiveMinWarning() {
            this._playNotes([
                { freq: 880, duration: 0.15, type: 'square', volume: 0.25, decay: 0.8 },
                { freq: 880, duration: 0.15, type: 'square', volume: 0.25, decay: 0.8 },
                { freq: 1046, duration: 0.35, type: 'sine', volume: 0.35, decay: 0.9 },
            ]);
        },

        /**
         * 🚨 倒數 1 分鐘緊急（快速三連響）
         */
        playOneMinWarning() {
            this._playNotes([
                { freq: 988, duration: 0.1, type: 'sawtooth', volume: 0.3, decay: 0.7 },
                { freq: 988, duration: 0.1, type: 'sawtooth', volume: 0.3, decay: 0.7 },
                { freq: 988, duration: 0.1, type: 'sawtooth', volume: 0.3, decay: 0.7 },
                { freq: 1318, duration: 0.4, type: 'sine', volume: 0.4, decay: 0.9 },
            ]);
        },

        /**
         * 🔔 考試結束鈴（下行三聲）
         */
        playEnd() {
            this._playNotes([
                { freq: 784, duration: 0.3, type: 'sine', volume: 0.45, decay: 0.9 },
                { freq: 659, duration: 0.3, type: 'sine', volume: 0.4, decay: 0.9 },
                { freq: 523, duration: 0.5, type: 'sine', volume: 0.5, decay: 0.9 },
            ]);
        },

        /**
         * ⏰ 計時器歸零（清脆單音）
         */
        playTimerEnd() {
            this._playNotes([
                { freq: 1046, duration: 0.15, type: 'sine', volume: 0.4, decay: 0.8 },
                { freq: 1318, duration: 0.15, type: 'sine', volume: 0.4, decay: 0.8 },
                { freq: 1568, duration: 0.4, type: 'sine', volume: 0.5, decay: 0.9 },
            ]);
        },

        /**
         * 🔉 按鈕點擊短促提示音
         */
        playClick() {
            this._playNotes([
                { freq: 1200, duration: 0.06, type: 'sine', volume: 0.2, decay: 0.9 },
            ]);
        },

        // =============================================
        // 靜音切換 API
        // =============================================

        toggle() {
            this._enabled = !this._enabled;
            localStorage.setItem(SOUNDS_STORAGE_KEY, String(this._enabled));

            // 更新所有靜音按鈕圖示
            document.querySelectorAll('.exam-sound-toggle-btn').forEach(btn => {
                this._updateBtnIcon(btn);
            });

            // 播放測試音確認已開啟
            if (this._enabled) this.playClick();

            return this._enabled;
        },

        isEnabled() {
            return this._enabled;
        },

        _updateBtnIcon(btn) {
            if (!btn) return;
            btn.textContent = this._enabled ? '🔔' : '🔇';
            btn.title = this._enabled ? '考試鈴聲：開（點一下關閉）' : '考試鈴聲：關（點一下開啟）';
            btn.setAttribute('aria-label', btn.title);
        },

        // =============================================
        // 考試監考邏輯 Hook
        // 在 updateFullscreenStatus 更新後自動判斷並觸發音效
        // =============================================

        /**
         * 在考試計時更新時呼叫此函式
         * @param {object|null} currentExam  - 當前進行中的考試科目物件
         * @param {number}      remainingMin - 剩餘分鐘數
         * @param {boolean}     justStarted  - 是否剛從「等待中」切換為「進行中」
         */
        onExamTick(currentExam, remainingMin, justStarted) {
            if (!currentExam) return;

            // 考試開始
            if (justStarted && this._once('start', currentExam)) {
                this.playStart();
                this._showToast('🔔 ' + currentExam.name + ' 開始！');
                return;
            }

            // 倒數 1 分鐘（優先於 5 分鐘）
            if (remainingMin <= 1 && this._once('oneMin', currentExam)) {
                this.playOneMinWarning();
                this._showToast('🚨 最後 1 分鐘！請確認姓名');
                return;
            }

            // 倒數 5 分鐘
            if (remainingMin <= 5 && remainingMin > 1 && this._once('fiveMin', currentExam)) {
                this.playFiveMinWarning();
                this._showToast('⚠️ 還剩 5 分鐘！開始收尾');
                return;
            }
        },

        /**
         * 考試結束時呼叫
         * @param {object} exam - 已結束的考試科目物件
         */
        onExamEnd(exam) {
            if (!exam) return;
            if (!this._once('end', exam)) return;
            this.playEnd();
            this._showToast('🔔 ' + exam.name + ' 考試時間結束！');
        },

        /**
         * 計時器歸零時呼叫
         */
        onTimerEnd() {
            this.playTimerEnd();
            this._showToast('⏰ 計時結束！');
        },

        // =============================================
        // Toast 通知（輕量提示，不影響考試畫面）
        // =============================================

        _toastTimer: null,

        _showToast(message) {
            let toast = document.getElementById('examSoundToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'examSoundToast';
                toast.style.cssText = `
                    position: fixed;
                    top: 1.5rem;
                    right: 1.5rem;
                    z-index: 99999;
                    background: rgba(30,37,56,0.95);
                    color: #fff;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    font-size: 1.1rem;
                    font-weight: 600;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255,255,255,0.1);
                    transform: translateY(-8px);
                    opacity: 0;
                    transition: all 0.3s ease;
                    pointer-events: none;
                    max-width: 280px;
                    word-break: break-word;
                `;
                document.body.appendChild(toast);
            }

            toast.textContent = message;

            // 顯示動畫
            requestAnimationFrame(() => {
                toast.style.transform = 'translateY(0)';
                toast.style.opacity = '1';
            });

            // 自動消失
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => {
                toast.style.transform = 'translateY(-8px)';
                toast.style.opacity = '0';
            }, 3000);
        },

        // =============================================
        // 靜音按鈕（考試全螢幕左上角的控制列）
        // =============================================
        // 什麼時候該響鈴由 exam-proctor.js 每秒判斷後呼叫 onExamTick／onExamEnd。
        // 舊版改成在這裡去包 window.updateFullscreenStatus，但那個函式從來沒有掛到 window 上，
        // 結果開始鈴、結束鈴、靜音按鈕全部沒有作用（2026-11-23 全站檢測發現）。

        /** 把 🔔／🔇 按鈕放進考試全螢幕的控制列（已經有就不重複放）。 */
        attachToggle() {
            const _self = this;
            const controlArea = document.querySelector('.exam-fullscreen-controls');
            if (!controlArea || document.getElementById('examSoundToggleBtn')) return;
            const btn = document.createElement('button');
            btn.id = 'examSoundToggleBtn';
            btn.className = 'exam-control-btn exam-sound-toggle-btn';
            btn.style.cssText = 'background:rgba(250,204,21,0.18); border:none; cursor:pointer;';
            _self._updateBtnIcon(btn);
            btn.onclick = () => {
                _self.toggle();
                _self.unlock();
            };
            controlArea.appendChild(btn);
        },

        init() {
            this.attachToggle();
        },
    };

    // =============================================
    // 對外暴露 API
    // =============================================
    window.ExamSounds = ExamSounds;

    // =============================================
    // 自動初始化：控制列是頁面上原本就有的，載入完就把靜音按鈕放上去
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ExamSounds.init());
    } else {
        ExamSounds.init();
    }

})();
