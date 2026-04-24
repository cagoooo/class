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

        // 初始化
        init() {
            this.checkIfInstalled();
            this.bindEvents();
            this.registerServiceWorker();
            this.bindManualUpdateBtn();

            // v3.1.3：監聽 controllerchange - 使用者點擊更新後新 SW 接管，自動重載
            if ('serviceWorker' in navigator) {
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    console.log('[PWA] 新版本已套用，重新載入頁面');
                    window.location.reload();
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

        // 註冊 Service Worker
        async registerServiceWorker() {
            if (!('serviceWorker' in navigator)) {
                console.warn('[PWA] 瀏覽器不支援 Service Worker');
                return;
            }

            try {
                const registration = await navigator.serviceWorker.register('./sw.js', {
                    scope: './'
                });

                console.log('[PWA] Service Worker 註冊成功:', registration.scope);

                // 儲存 registration 到全域以供 sync-status-indicator 存取
                window.__pwaRegistration = registration;

                // 監聽更新：不再跳出攔路橫幅，改為靜默下載 + 通知 sync-status-indicator
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
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
                    registration.update();
                    localStorage.setItem(LAST_CHECK_KEY, String(now));
                } else {
                    const minsLeft = Math.ceil((CHECK_INTERVAL - (now - lastCheck)) / 60000);
                    console.log(`[PWA] 節流跳過本次更新檢查（${minsLeft} 分鐘後再檢查）`);
                }

            } catch (error) {
                console.error('[PWA] Service Worker 註冊失敗:', error);
            }
        },

        // v3.1.3：通知 sync-status-indicator「有新版本可套用」
        // 不顯示攔路橫幅，使用者可在下次自然 reload 時自動套用，或主動點同步指示器套用
        notifyUpdateAvailable(registration) {
            window.__pwaUpdateAvailable = true;
            window.__pwaUpdateRegistration = registration;
            // 若 sync-status-indicator 已載入，通知它顯示更新可用
            if (window.SyncStatusIndicator?.setUpdateAvailable) {
                window.SyncStatusIndicator.setUpdateAvailable(true);
            }
            // 事件廣播，讓其他模組也能監聽
            window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { registration } }));
        },

        // 主動套用等待中的新 SW（由使用者明確操作觸發）
        applyPendingUpdate() {
            const reg = window.__pwaUpdateRegistration || window.__pwaRegistration;
            if (!reg || !reg.waiting) {
                console.warn('[PWA] 沒有等待中的新版本');
                return false;
            }
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // SW 接管後會觸發 controllerchange，然後重載頁面
            return true;
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
        /**
         * 一鍵更新：v3.1.3 改為智能版
         * - 優先：若有 waiting 的新 SW，直接 SKIP_WAITING 接管（快速，~1 秒）
         * - 備援：清除所有快取 + unregister + reload（慢速，需重新下載）
         */
        async manualUpdate() {
            const btn = document.getElementById('pwaManualUpdateBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '🔄 更新中…';
            }

            try {
                // 快速路徑：有待套用的新 SW
                const reg = window.__pwaUpdateRegistration || window.__pwaRegistration;
                if (reg && reg.waiting) {
                    console.log('[PWA] 使用快速更新路徑（postMessage SKIP_WAITING）');
                    if (btn) btn.textContent = '✅ 套用更新中…';
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    // controllerchange 事件會自動 reload，但仍加一個備援
                    setTimeout(() => window.location.reload(), 1500);
                    return;
                }

                // 慢速路徑：清除所有快取
                console.log('[PWA] 使用完整重置路徑（清除快取 + unregister）');
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(r => r.unregister()));
                    console.log('[PWA] 已取消所有 Service Worker 註冊');
                }
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                    console.log('[PWA] 已清除所有快取:', cacheNames);
                }
                if (btn) btn.textContent = '✅ 更新完成，重新載入中…';
                setTimeout(() => window.location.reload(true), 800);

            } catch (error) {
                console.error('[PWA] 一鍵更新失敗:', error);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '❌ 更新失敗，請重試';
                    setTimeout(() => {
                        btn.textContent = '🔄 一鍵更新';
                    }, 3000);
                }
            }
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
