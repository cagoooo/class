/**
 * PWA 安裝引導模組
 * @version 2.6.1
 * @description 提供友善的 PWA 安裝提示與引導
 */

(function () {
    'use strict';

    // ==================== PWA 安裝管理器 ====================
    const PWAInstaller = {
        deferredPrompt: null,
        isInstalled: false,
        installButton: null,
        _reloadStarted: false,

        // 初始化
        init() {
            this.checkIfInstalled();
            this.bindEvents();
            this.registerServiceWorker();
            this.bindManualUpdateBtn();

            // v3.1.3：監聽 controllerchange - 使用者點擊更新後新 SW 接管，自動重載
            if ('serviceWorker' in navigator) {
                this._reloadStarted = false;
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    this.reloadPageOnce('新版本已套用');
                });
            }

            // 延遲顯示安裝提示（首次訪問後 30 秒）
            const hasSeenPrompt = localStorage.getItem('pwaPromptSeen');
            const installDismissed = localStorage.getItem('pwaInstallDismissed');

            if (!this.isInstalled && !hasSeenPrompt && !installDismissed) {
                setTimeout(() => this.showInstallPrompt(), 30000);
            }

            console.log('[PWA] 安裝模組已初始化', { isInstalled: this.isInstalled });
        },

        // 檢查是否已安裝
        checkIfInstalled() {
            // 檢查 standalone 模式
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            // iOS Safari standalone
            const isIOSStandalone = window.navigator.standalone === true;
            // 來自 TWA
            const referrer = document.referrer.includes('android-app://');

            this.isInstalled = isStandalone || isIOSStandalone || referrer;

            // 監聽 display-mode 變化
            window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
                this.isInstalled = e.matches;
                if (e.matches) {
                    this.hideInstallPrompt();
                    localStorage.setItem('pwaInstalled', 'true');
                }
            });

            return this.isInstalled;
        },

        // 綁定事件
        bindEvents() {
            // 攔截安裝提示事件
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredPrompt = e;
                console.log('[PWA] beforeinstallprompt 事件已攔截');

                // 可以立即顯示安裝按鈕
                this.showInstallButton();
            });

            // 安裝完成事件
            window.addEventListener('appinstalled', (e) => {
                console.log('[PWA] 應用已安裝');
                this.isInstalled = true;
                this.deferredPrompt = null;
                this.hideInstallPrompt();
                localStorage.setItem('pwaInstalled', 'true');

                // 顯示成功通知
                if (typeof showNotification === 'function') {
                    showNotification('🎉 班級小管家已成功加入主畫面！', 'success');
                }
            });
        },

        logServiceWorkerFailure(error, action) {
            const message = error?.message || String(error || '未知錯誤');
            console.warn(`[PWA] ${action}失敗（不影響網站使用）：${message}`);
        },

        reloadPageOnce(reason) {
            if (this._reloadStarted) return;
            this._reloadStarted = true;
            console.log(`[PWA] ${reason || '更新流程完成'}，重新載入頁面`);
            window.location.reload();
        },

        activateWaitingWorker(worker) {
            if (!worker) return false;
            try {
                worker.postMessage({ type: 'SKIP_WAITING' });
            } catch (error) {
                this.logServiceWorkerFailure(error, '套用等待中的版本');
                this.reloadPageOnce('套用更新失敗');
                return false;
            }
            // controllerchange 是主要路徑；計時器只防止特定 Safari 版本不送事件。
            setTimeout(() => this.reloadPageOnce('更新已套用'), 1500);
            return true;
        },

        // 註冊 Service Worker
        async registerServiceWorker() {
            if (!('serviceWorker' in navigator)) {
                console.warn('[PWA] 瀏覽器不支援 Service Worker');
                return;
            }

            try {
                const registration = await navigator.serviceWorker.register('./sw.js', {
                    scope: './',
                    updateViaCache: 'none' // 繞過瀏覽器對 sw.js 的 HTTP 快取，確保能可靠偵測新版
                });

                console.log('[PWA] Service Worker 註冊成功:', registration.scope);

                // 儲存 registration 到全域以供 sync-status-indicator 存取
                window.__pwaRegistration = registration;

                // 監聽更新：不再跳出攔路橫幅，改為靜默下載 + 通知 sync-status-indicator
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker) {
                        console.warn('[PWA] 偵測到更新，但瀏覽器未提供 installing worker');
                        return;
                    }
                    console.log('[PWA] 背景發現新版本，靜默下載中...');

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 有新版本已下載並 waiting，但不強制套用
                            console.log('[PWA] 新版本已下載，等待使用者主動套用');
                            this.notifyUpdateAvailable(registration);
                        }
                    });
                });

                // 已有 waiting 版本（之前載入時下載過但未套用）
                if (registration.waiting) {
                    this.notifyUpdateAvailable(registration);
                }

                // v3.1.3 節流：只在首次載入或超過 30 分鐘才檢查更新
                // 避免每次切換班級 reload 都重新檢查（高頻干擾老師）
                const LAST_CHECK_KEY = 'pwaLastUpdateCheck';
                const CHECK_INTERVAL = 30 * 60 * 1000; // 30 分鐘
                const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
                const now = Date.now();
                if (now - lastCheck > CHECK_INTERVAL) {
                    console.log('[PWA] 節流通過，背景檢查更新');
                    try {
                        const updatePromise = registration.update();
                        if (updatePromise && typeof updatePromise.then === 'function') {
                            updatePromise
                                .then(() => localStorage.setItem(LAST_CHECK_KEY, String(now)))
                                .catch(error => this.logServiceWorkerFailure(error, '背景更新檢查'));
                        } else {
                            localStorage.setItem(LAST_CHECK_KEY, String(now));
                        }
                    } catch (error) {
                        this.logServiceWorkerFailure(error, '背景更新檢查');
                    }
                } else {
                    const minsLeft = Math.ceil((CHECK_INTERVAL - (now - lastCheck)) / 60000);
                    console.log(`[PWA] 節流跳過本次更新檢查（${minsLeft} 分鐘後再檢查）`);
                }

            } catch (error) {
                console.error('[PWA] Service Worker 註冊失敗:', error);
            }
        },

        // v3.1.3：通知 sync-status-indicator「有新版本可套用」
        notifyUpdateAvailable(registration) {
            window.__pwaUpdateAvailable = true;
            window.__pwaUpdateRegistration = registration;
            // 若 sync-status-indicator 已載入，通知它顯示更新可用
            if (window.SyncStatusIndicator?.setUpdateAvailable) {
                window.SyncStatusIndicator.setUpdateAvailable(true);
            }
            // 事件廣播，讓其他模組也能監聽
            window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { registration } }));

            // R-C3：主動彈出提示橫幅
            this.showUpdateBanner();
        },

        // 彈出常駐更新提示橫幅（Update Banner）
        showUpdateBanner() {
            if (document.getElementById('pwa-update-banner')) return;

            // 注入 Banner 專屬樣式
            if (!document.getElementById('pwa-update-banner-style')) {
                const s = document.createElement('style');
                s.id = 'pwa-update-banner-style';
                s.textContent = `
                    #pwa-update-banner {
                        position: fixed;
                        bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                        left: 50%;
                        width: min(520px, calc(100vw - 24px));
                        box-sizing: border-box;
                        z-index: 19998;
                        background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                        color: #ffffff;
                        box-shadow: 0 8px 24px rgba(30, 64, 175, 0.32);
                        padding: 12px 14px;
                        font-family: 'Noto Sans TC', sans-serif;
                        font-size: 0.9rem;
                        font-weight: 500;
                        display: flex;
                        align-items: center;
                        gap: 0.65rem;
                        flex-wrap: wrap;
                        transform: translate(-50%, calc(100% + 16px));
                        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                        backdrop-filter: blur(8px);
                        border: 1px solid rgba(255,255,255,0.24);
                        border-radius: 16px;
                    }
                    #pwa-update-banner.show {
                        transform: translate(-50%, 0);
                    }
                    .pwa-update-message {
                        flex: 1 1 220px;
                        line-height: 1.45;
                    }
                    .pwa-update-btn {
                        background: #ffffff;
                        color: #1d4ed8;
                        border: none;
                        padding: 4px 14px;
                        border-radius: 999px;
                        font-weight: 700;
                        cursor: pointer;
                        font-size: 0.82rem;
                        transition: all 0.2s;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                    }
                    .pwa-update-btn:hover {
                        background: #f3f4f6;
                        transform: scale(1.05);
                    }
                    .pwa-update-btn:active {
                        transform: scale(0.95);
                    }
                    .pwa-update-close {
                        background: rgba(255,255,255,0.18);
                        border: none;
                        color: #ffffff;
                        padding: 2px 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.8rem;
                        transition: background 0.2s;
                    }
                    .pwa-update-close:hover {
                        background: rgba(255,255,255,0.3);
                    }
                `;
                document.head.appendChild(s);
            }

            const banner = document.createElement('div');
            banner.id = 'pwa-update-banner';
            banner.innerHTML = `
                <span style="font-size: 1.1rem;">✨</span>
                <span class="pwa-update-message">班級小管家有新版本，現在重新載入即可套用。</span>
                <button class="pwa-update-btn" id="pwa-update-btn-action">立即更新</button>
                <button class="pwa-update-close" id="pwa-update-btn-close">稍後</button>
            `;

            document.body.appendChild(banner);

            banner.querySelector('#pwa-update-btn-action').addEventListener('click', (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                b.textContent = '更新中…';
                this.applyPendingUpdate();
            });

            banner.querySelector('#pwa-update-btn-close').addEventListener('click', () => {
                banner.classList.remove('show');
                setTimeout(() => banner.remove(), 400);
            });

            requestAnimationFrame(() => {
                banner.classList.add('show');
            });
        },

        // 主動套用等待中的新 SW（由使用者明確操作觸發）。
        // 更新失敗只重載目前頁面，不清除其他 App 的 Cache，也不取消其他 SW 註冊。
        async applyPendingUpdate() {
            try {
                let reg = window.__pwaUpdateRegistration || window.__pwaRegistration;
                if (!reg && 'serviceWorker' in navigator) {
                    reg = await navigator.serviceWorker.getRegistration();
                }

                if (!reg) {
                    console.warn('[PWA] 找不到 Service Worker，重新載入目前頁面');
                    this.reloadPageOnce('找不到 Service Worker');
                    return true;
                }

                // 快速路徑：有等待中的新 SW → 請它接管，controllerchange 會自動 reload
                if (reg && reg.waiting) {
                    console.log('[PWA] 快速更新路徑（SKIP_WAITING）');
                    return this.activateWaitingWorker(reg.waiting);
                }

                // waiting 可能在點擊前已被瀏覽器消耗；重新檢查後交給正常網路優先載入。
                console.log('[PWA] 目前沒有 waiting worker，重新檢查後載入最新頁面');
                await reg.update();
                if (reg.waiting) return this.activateWaitingWorker(reg.waiting);
                this.reloadPageOnce('更新檢查完成');
                return true;
            } catch (err) {
                this.logServiceWorkerFailure(err, '套用更新');
                this.reloadPageOnce('更新檢查失敗');
                return false;
            }
        },

        // 顯示安裝按鈕（Header 中）
        showInstallButton() {
            // 如果已安裝，不顯示
            if (this.isInstalled) return;

            // 查找 Header 區域添加安裝按鈕
            const headerActions = document.querySelector('.header-actions, .header-buttons, header');
            if (!headerActions) return;

            // 避免重複添加
            if (document.getElementById('pwaInstallBtn')) return;

            this.installButton = document.createElement('button');
            this.installButton.id = 'pwaInstallBtn';
            this.installButton.className = 'pwa-install-btn';
            this.installButton.innerHTML = '📲 安裝';
            this.installButton.title = '將班級小管家安裝到桌面';

            this.installButton.addEventListener('click', () => this.promptInstall());

            headerActions.appendChild(this.installButton);
        },

        // 顯示安裝提示彈窗
        showInstallPrompt() {
            if (this.isInstalled) return;

            localStorage.setItem('pwaPromptSeen', 'true');

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

            if (isIOS) {
                this.showIOSGuide();
            } else if (this.deferredPrompt) {
                this.showAndroidPrompt();
            } else {
                // 如果沒有 beforeinstallprompt，顯示通用提示
                this.showGenericPrompt();
            }
        },

        // iOS 安裝引導
        showIOSGuide() {
            const guide = document.createElement('div');
            guide.id = 'pwa-ios-guide';
            guide.className = 'pwa-install-modal';
            guide.innerHTML = `
        <div class="pwa-modal-overlay" id="pwaModalOverlay"></div>
        <div class="pwa-modal-content pwa-ios-content">
          <button class="pwa-modal-close" id="pwaModalClose">✕</button>
          <div class="pwa-modal-header">
            <span class="pwa-app-icon">📚</span>
            <h3>安裝班級小管家</h3>
          </div>
          <div class="pwa-modal-body">
            <p class="pwa-description">將此應用加入主畫面，隨時快速開啟！</p>
            <div class="pwa-ios-steps">
              <div class="pwa-step">
                <span class="step-number">1</span>
                <span class="step-text">點擊底部的 <span class="share-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16,6 12,2 8,6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                </span> 分享按鈕</span>
              </div>
              <div class="pwa-step">
                <span class="step-number">2</span>
                <span class="step-text">向下捲動選單，點選 <strong>「加入主畫面」</strong></span>
              </div>
              <div class="pwa-step">
                <span class="step-number">3</span>
                <span class="step-text">點擊 <strong>「新增」</strong> 完成安裝</span>
              </div>
            </div>
          </div>
          <div class="pwa-modal-footer">
            <button class="pwa-btn-secondary" id="pwaLater">稍後再說</button>
          </div>
        </div>
      `;

            document.body.appendChild(guide);
            this.bindModalEvents(guide);
        },

        // Android/Chrome 安裝提示
        showAndroidPrompt() {
            const prompt = document.createElement('div');
            prompt.id = 'pwa-android-prompt';
            prompt.className = 'pwa-install-modal';
            prompt.innerHTML = `
        <div class="pwa-modal-overlay" id="pwaModalOverlay"></div>
        <div class="pwa-modal-content">
          <button class="pwa-modal-close" id="pwaModalClose">✕</button>
          <div class="pwa-modal-header">
            <span class="pwa-app-icon">📚</span>
            <h3>安裝班級小管家</h3>
          </div>
          <div class="pwa-modal-body">
            <p class="pwa-description">將應用安裝到您的裝置，享受更好的使用體驗：</p>
            <ul class="pwa-benefits">
              <li>📱 從主畫面快速開啟</li>
              <li>🚀 載入速度更快</li>
              <li>📴 離線也能使用</li>
              <li>🔔 接收即時通知</li>
            </ul>
          </div>
          <div class="pwa-modal-footer">
            <button class="pwa-btn-secondary" id="pwaLater">稍後再說</button>
            <button class="pwa-btn-primary" id="pwaInstallNow">立即安裝</button>
          </div>
        </div>
      `;

            document.body.appendChild(prompt);
            this.bindModalEvents(prompt);

            // 立即安裝按鈕
            document.getElementById('pwaInstallNow').addEventListener('click', () => {
                this.promptInstall();
                prompt.remove();
            });
        },

        // 通用提示（瀏覽器不支援 beforeinstallprompt）
        showGenericPrompt() {
            const prompt = document.createElement('div');
            prompt.id = 'pwa-generic-prompt';
            prompt.className = 'pwa-install-modal';
            prompt.innerHTML = `
        <div class="pwa-modal-overlay" id="pwaModalOverlay"></div>
        <div class="pwa-modal-content">
          <button class="pwa-modal-close" id="pwaModalClose">✕</button>
          <div class="pwa-modal-header">
            <span class="pwa-app-icon">📚</span>
            <h3>安裝班級小管家</h3>
          </div>
          <div class="pwa-modal-body">
            <p class="pwa-description">使用瀏覽器的「加入主畫面」或「安裝應用」功能，將班級小管家添加到您的裝置。</p>
            <p class="pwa-hint">💡 通常可在瀏覽器選單中找到此選項</p>
          </div>
          <div class="pwa-modal-footer">
            <button class="pwa-btn-secondary" id="pwaLater">我知道了</button>
          </div>
        </div>
      `;

            document.body.appendChild(prompt);
            this.bindModalEvents(prompt);
        },

        // 綁定 Modal 事件
        bindModalEvents(modal) {
            const closeBtn = modal.querySelector('#pwaModalClose');
            const laterBtn = modal.querySelector('#pwaLater');
            const overlay = modal.querySelector('#pwaModalOverlay');

            const closeModal = () => {
                modal.classList.add('closing');
                setTimeout(() => modal.remove(), 300);
            };

            closeBtn?.addEventListener('click', closeModal);
            laterBtn?.addEventListener('click', () => {
                localStorage.setItem('pwaInstallDismissed', Date.now().toString());
                closeModal();
            });
            overlay?.addEventListener('click', closeModal);

            // ESC 關閉
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        },

        // 觸發原生安裝提示
        async promptInstall() {
            if (!this.deferredPrompt) {
                console.log('[PWA] 沒有可用的安裝提示');
                return false;
            }

            try {
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;

                console.log('[PWA] 使用者選擇:', outcome);

                if (outcome === 'accepted') {
                    this.isInstalled = true;
                    localStorage.setItem('pwaInstalled', 'true');
                }

                this.deferredPrompt = null;
                return outcome === 'accepted';
            } catch (error) {
                console.error('[PWA] 安裝提示錯誤:', error);
                return false;
            }
        },

        // 隱藏安裝提示
        hideInstallPrompt() {
            const modals = document.querySelectorAll('.pwa-install-modal');
            modals.forEach(modal => modal.remove());

            if (this.installButton) {
                this.installButton.remove();
                this.installButton = null;
            }
        },

        // ==================== 手動一鍵更新 ====================
        /** 一鍵更新：共用安全的 waiting worker／重新載入流程。 */
        async manualUpdate() {
            const btn = document.getElementById('pwaManualUpdateBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '🔄 更新中…';
            }

            if (btn) btn.textContent = '✅ 套用更新中…';
            const result = await this.applyPendingUpdate();
            if (!this._reloadStarted && btn) {
                btn.disabled = false;
                btn.textContent = result ? '🔄 一鍵更新' : '❌ 更新失敗，請重試';
            }
            return result;
        },

        // 綁定手動更新按鈕
        bindManualUpdateBtn() {
            const btn = document.getElementById('pwaManualUpdateBtn');
            if (btn) {
                btn.addEventListener('click', () => this.manualUpdate());
                console.log('[PWA] 一鍵更新按鈕已綁定');
            }
        }
    };

    // ==================== 初始化 ====================

    // DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PWAInstaller.init());
    } else {
        PWAInstaller.init();
    }

    // 暴露全域 API
    window.PWAInstaller = PWAInstaller;

})();
