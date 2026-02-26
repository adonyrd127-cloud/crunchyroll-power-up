// ============================================
// AniList Popup — UI Logic
// Crunchyroll Power Up Extension
// ============================================

(function () {
    'use strict';

    // ─── Config ─────────────────────────────
    // Your AniList API Client ID
    const ANILIST_CLIENT_ID = 36270;
    const ANILIST_AUTH_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

    // ─── Helpers ────────────────────────────

    function timeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const secs = Math.floor(diff / 1000);
        if (secs < 60) return 'Hace un momento';
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `Hace ${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `Hace ${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `Hace ${days}d`;
        return `Hace ${Math.floor(days / 7)} sem`;
    }

    function $(id) { return document.getElementById(id); }

    // ─── DOM references ─────────────────────

    const connectView = $('alConnectView');
    const connectedView = $('alConnectedView');
    const oauthBtn = $('alOAuthBtn');
    const tokenInput = $('alTokenInput');
    const connectBtn = $('alConnectBtn');
    const errorDiv = $('alError');
    const avatarFallback = $('alAvatarFallback');
    const usernameEl = $('alUsername');
    const userStatEl = $('alUserStat');
    const disconnectBtn = $('alDisconnectBtn');
    const syncEnabledCb = $('alSyncEnabled');
    const notifEnabledCb = $('alNotifEnabled');
    const banner = $('alBanner');
    const bannerIcon = $('alBannerIcon');
    const bannerText = $('alBannerText');
    const historyList = $('alHistoryList');
    const syncAllBtn = $('alSyncAllBtn');

    // Guard: if tab-anilist doesn't exist, bail out
    if (!connectView || !connectedView) return;

    // ─── Show/hide views ────────────────────

    function showConnectView() {
        connectView.style.display = '';
        connectedView.style.display = 'none';
    }

    function showConnectedView(viewer) {
        connectView.style.display = 'none';
        connectedView.style.display = '';

        // Avatar
        const avatarContainer = $('alAvatarFallback') || $('alAvatarImg');
        if (viewer.avatar && (viewer.avatar.large || viewer.avatar.medium)) {
            const imgUrl = viewer.avatar.large || viewer.avatar.medium;
            if (avatarContainer) {
                const img = document.createElement('img');
                img.className = 'al-avatar';
                img.id = 'alAvatarImg';
                img.src = imgUrl;
                img.alt = viewer.name;
                avatarContainer.replaceWith(img);
            }
        } else if (avatarContainer && avatarContainer.classList.contains('al-avatar-fallback')) {
            avatarContainer.textContent = (viewer.name || '?')[0].toUpperCase();
        }

        // Username & stats
        usernameEl.textContent = viewer.name || 'Usuario';
        const epCount = viewer.statistics?.anime?.episodesWatched || 0;
        userStatEl.textContent = `${epCount.toLocaleString()} episodios vistos en AniList`;

        loadHistory();
    }

    // ─── Banner ─────────────────────────────

    let _bannerTimeout = null;

    function showBanner(type, icon, text) {
        banner.className = 'al-banner ' + type;
        bannerIcon.textContent = icon;
        bannerText.textContent = text;
        banner.style.display = 'flex';

        if (_bannerTimeout) clearTimeout(_bannerTimeout);
        _bannerTimeout = setTimeout(() => {
            banner.style.display = 'none';
        }, 5000);
    }

    // ─── History ────────────────────────────

    function loadHistory() {
        chrome.storage.local.get('anilist_history', (data) => {
            const history = (data.anilist_history || []).slice(0, 6);

            if (history.length === 0) {
                historyList.innerHTML = '<div class="al-history-empty">Sin sincronizaciones aún</div>';
                return;
            }

            historyList.innerHTML = history.map(item => {
                const icon = item.status === 'COMPLETED' ? '🏆' : '✅';
                const badgeClass = item.status === 'COMPLETED' ? 'al-h-badge completed' : 'al-h-badge';
                const badgeText = item.status === 'COMPLETED' ? 'Completado' : `Ep ${item.episodeNumber}`;
                const title = (item.seriesTitle || '').length > 28
                    ? item.seriesTitle.substring(0, 28) + '…'
                    : item.seriesTitle;

                return `
          <div class="al-history-item">
            <span class="al-h-icon">${icon}</span>
            <div class="al-h-info">
              <div class="al-h-title" title="${item.seriesTitle || ''}">${title}</div>
              <div class="al-h-time">${timeAgo(item.syncedAt)}</div>
            </div>
            <span class="${badgeClass}">${badgeText}</span>
          </div>
        `;
            }).join('');
        });
    }

    // ─── Settings ───────────────────────────

    function loadSettings() {
        chrome.storage.sync.get('anilist_settings', (data) => {
            const s = data.anilist_settings || { syncEnabled: true, showNotifications: true };
            syncEnabledCb.checked = s.syncEnabled !== false;
            notifEnabledCb.checked = s.showNotifications !== false;
        });
    }

    function saveSettings() {
        const settings = {
            syncEnabled: syncEnabledCb.checked,
            showNotifications: notifEnabledCb.checked
        };
        chrome.storage.sync.set({ anilist_settings: settings });
    }

    // ─── Event listeners ───────────────────

    // OAuth connect button — opens AniList authorization page
    oauthBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: ANILIST_AUTH_URL });
    });

    // Manual connect button (fallback)
    connectBtn.addEventListener('click', () => {
        const token = tokenInput.value.trim();
        if (!token) {
            errorDiv.textContent = 'Por favor ingresa tu token';
            errorDiv.style.display = 'block';
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = 'Verificando...';
        errorDiv.style.display = 'none';

        chrome.runtime.sendMessage({ type: 'anilist_save_token', token }, (response) => {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Conectar';

            if (chrome.runtime.lastError) {
                errorDiv.textContent = 'Error de conexión: ' + chrome.runtime.lastError.message;
                errorDiv.style.display = 'block';
                return;
            }

            if (response && response.success) {
                showConnectedView(response.viewer);
                loadSettings();
            } else {
                errorDiv.textContent = response?.error || 'Token inválido. Verifica e intenta de nuevo.';
                errorDiv.style.display = 'block';
            }
        });
    });

    // Enter key on token input
    tokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connectBtn.click();
    });

    // Disconnect
    disconnectBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'anilist_logout' }, () => {
            showConnectView();
            tokenInput.value = '';
        });
    });

    // Toggle changes
    syncEnabledCb.addEventListener('change', saveSettings);
    notifEnabledCb.addEventListener('change', saveSettings);

    // Sync all button
    syncAllBtn.addEventListener('click', () => {
        syncAllBtn.disabled = true;
        syncAllBtn.innerHTML = '<span class="spinning">🔄</span> <span>Sincronizando...</span>';

        chrome.runtime.sendMessage({ type: 'anilist_manual_sync' }, (response) => {
            syncAllBtn.disabled = false;
            syncAllBtn.innerHTML = '<span>🔄</span> <span>Sincronizar todo ahora</span>';

            if (response && response.success) {
                const synced = response.synced?.length || 0;
                const failed = response.failed?.length || 0;
                showBanner('success', '✅', `${synced} sincronizado(s), ${failed} fallido(s)`);
                loadHistory();
            } else {
                showBanner('error', '❌', response?.error || 'Error al sincronizar');
            }
        });
    });

    // Listen for real-time updates from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action !== 'anilist_update') return;

        switch (msg.type) {
            case 'success':
                showBanner('success', '✅', `${msg.seriesTitle} — Ep.${msg.episodeNumber} ${msg.status === 'COMPLETED' ? '¡Completado!' : 'sincronizado'}`);
                loadHistory();
                break;
            case 'not_found':
                showBanner('warning', '⚠️', `No se encontró "${msg.seriesTitle}" en AniList`);
                break;
            case 'error':
                showBanner('error', '❌', `Error: ${msg.error || 'desconocido'}`);
                break;
        }
    });

    // Listen for storage changes (auto-detect when token is captured by content script)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.anilist_token && changes.anilist_viewer) {
            const token = changes.anilist_token.newValue;
            const viewer = changes.anilist_viewer.newValue;

            if (token && viewer) {
                // Token was just saved (by the capture script or manually)
                showConnectedView(viewer);
                loadSettings();
                showBanner('success', '✅', `¡Conectado como ${viewer.name}!`);
            }
        }

        if (changes.anilist_token && !changes.anilist_token.newValue) {
            // Token was removed (logout)
            showConnectView();
        }
    });

    // ─── Init ───────────────────────────────

    chrome.storage.local.get(['anilist_token', 'anilist_viewer'], (data) => {
        if (data.anilist_token && data.anilist_viewer) {
            showConnectedView(data.anilist_viewer);
            loadSettings();
        } else {
            showConnectView();
        }
    });

})();
