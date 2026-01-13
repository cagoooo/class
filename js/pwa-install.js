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

                // 監聽更新
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[PWA] 發現新版本 Service Worker');

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 有新版本可用
                            this.showUpdatePrompt(registration);
                        }
                    });
                });

                // 檢查更新
                registration.update();

            } catch (error) {
                console.error('[PWA] Service Worker 註冊失敗:', error);
            }
        },

        // 顯示更新提示
        showUpdatePrompt(registration) {
            const updateBanner = document.createElement('div');
            updateBanner.id = 'pwa-update-banner';
            updateBanner.className = 'pwa-update-banner';
            updateBanner.innerHTML = `
        <div class="update-content">
          <span class="update-icon">🔄</span>
          <span class="update-text">發現新版本！</span>
          <button class="update-btn" id="pwaUpdateBtn">立即更新</button>
          <button class="update-close" id="pwaUpdateClose">✕</button>
        </div>
      `;

            document.body.appendChild(updateBanner);

            // 更新按鈕
            document.getElementById('pwaUpdateBtn').addEventListener('click', () => {
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                window.location.reload();
            });

            // 關閉按鈕
            document.getElementById('pwaUpdateClose').addEventListener('click', () => {
                updateBanner.remove();
            });
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
