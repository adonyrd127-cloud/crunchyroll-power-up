// ═══════════════════════════════════════ TABS
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + target)?.classList.add('active');
    });
});

// ═══════════════════════════════════════ CONFIG
const DEFAULT_CONFIG = {
    autoSkipIntro: false,
    autoSkipRecap: false,
    autoSkipEnding: false,
    theaterMode: false,
    nextEpisodeDate: true,
    calendarFilter: false,
    miniPlayerEnabled: false,
    showSkipButtons: true,
};

function saveConfig(key, value) {
    const obj = {};
    obj[key] = value;
    chrome.storage.sync.set(obj);
}

// ═══════════════════════════════════════ CHIPS
function initChips() {
    document.querySelectorAll('.chip').forEach(chip => {
        const input = chip.querySelector('input[type=checkbox]');
        if (!input) return;
        input.addEventListener('change', () => {
            chip.classList.toggle('active', input.checked);
        });
    });
}

// ═══════════════════════════════════════ QUICK PILLS (home tab)
const quickPillMap = {
    'qp-theater': 'theaterMode',
    'qp-pip': 'miniPlayerEnabled',
    'qp-intro': 'autoSkipIntro',
    'qp-calendar': 'calendarFilter',
};

function initQuickPills(config) {
    document.querySelectorAll('.quick-pill').forEach(pill => {
        const key = pill.dataset.key;
        if (config[key]) pill.classList.add('on');
        pill.addEventListener('click', () => {
            const current = pill.classList.contains('on');
            pill.classList.toggle('on', !current);
            saveConfig(key, !current);
            // Sync with settings tab
            const settingsCheckbox = document.getElementById(settingsCheckboxId(key));
            if (settingsCheckbox) settingsCheckbox.checked = !current;

            // Sync chips if it's autoSkipIntro
            const chip = document.querySelector(`.chip[data-key="${key}"]`);
            if (chip) chip.classList.toggle('active', !current);
        });
    });
}

function settingsCheckboxId(key) {
    const map = {
        theaterMode: 'theaterMode',
        miniPlayerEnabled: 'miniPlayer',
        autoSkipIntro: 'skipIntro',
        calendarFilter: 'calendarFilter',
    };
    return map[key] || key;
}

// ═══════════════════════════════════════ TOGGLES
function bindToggle(checkboxId, storageKey, onChangeFn) {
    const el = document.getElementById(checkboxId);
    if (!el) return;
    el.addEventListener('change', () => {
        saveConfig(storageKey, el.checked);
        if (onChangeFn) onChangeFn(el.checked);
        // Sync quick pills
        const pill = document.querySelector(`.quick-pill[data-key="${storageKey}"]`);
        if (pill) pill.classList.toggle('on', el.checked);
    });
}

// ═══════════════════════════════════════ LOAD CONFIG
function loadConfig() {
    chrome.storage.sync.get(DEFAULT_CONFIG, config => {
        // Chips (skip)
        const ci = document.getElementById('skipIntro');
        const cr = document.getElementById('skipRecap');
        const ce = document.getElementById('skipEnding');
        if (ci) { ci.checked = config.autoSkipIntro; document.getElementById('chip-intro')?.classList.toggle('active', config.autoSkipIntro); }
        if (cr) { cr.checked = config.autoSkipRecap; document.getElementById('chip-recap')?.classList.toggle('active', config.autoSkipRecap); }
        if (ce) { ce.checked = config.autoSkipEnding; document.getElementById('chip-ending')?.classList.toggle('active', config.autoSkipEnding); }

        // Toggles
        setToggle('showSkipButtons', config.showSkipButtons);
        setToggle('theaterMode', config.theaterMode);
        setToggle('miniPlayer', config.miniPlayerEnabled);
        setToggle('calendarFilter', config.calendarFilter);
        setToggle('nextEpisodeDate', config.nextEpisodeDate);

        // Quick pills
        initQuickPills(config);
    });
}

function setToggle(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value;
}

// ═══════════════════════════════════════ ANIMES
async function loadFollowedAnimes() {
    const { followedAnimes = [] } = await chrome.storage.local.get('followedAnimes');

    // Stats
    const newCount = followedAnimes.filter(a => a.newEpisodes > 0 || a.hasNewEpisode).length;
    document.getElementById('stat-siguiendo').textContent = followedAnimes.length;
    document.getElementById('stat-nuevos').textContent = newCount;

    // Tab badge
    const badge = document.getElementById('new-badge');
    if (newCount > 0) { badge.textContent = newCount; badge.style.display = 'flex'; }
    else badge.style.display = 'none';

    // Home preview (3 max)
    renderAnimeList('home-anime-list', 'home-empty', followedAnimes.slice(0, 3), true);

    // Following tab (all)
    renderAnimeList('following-list', 'following-empty', followedAnimes, false);

    // Manage btn
    const manageBtn = document.getElementById('manageBtn');
    const manageBadge = document.getElementById('manageBadge');
    if (manageBtn) {
        manageBtn.style.display = followedAnimes.length > 0 ? 'flex' : 'none';
        if (manageBadge) manageBadge.textContent = followedAnimes.length;
    }
}

function renderAnimeList(listId, emptyId, animes, compact) {
    const container = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!container) return;

    if (animes.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = '';
    const sorted = [...animes].sort((a, b) => (b.addedDate || 0) - (a.addedDate || 0));

    sorted.forEach(anime => {
        const hasNew = anime.newEpisodes > 0 || anime.hasNewEpisode;
        const newLabel = hasNew ? `<span class="ep-new-label">✨ ${anime.newEpisodes || 1} ep nuevo${anime.newEpisodes > 1 ? 's' : ''}</span>` : `Ep ${anime.lastEpisode || '?'}`;

        // Source indicator dot
        const source = anime.detectionSource || '';
        const sourceClass = source === 'rss' ? 'rss' : source === 'anilist' ? 'anilist' : source === 'stale' ? 'stale' : '';
        const sourceTooltip = source === 'rss' ? 'Confirmado vía RSS' : source === 'anilist' ? 'Estimado vía AniList' : source === 'stale' ? 'Sin datos recientes' : '';
        const sourceDot = sourceClass ? `<span class="source-dot ${sourceClass}" title="${sourceTooltip}"></span>` : '';

        if (compact) {
            // Home preview style
            const el = document.createElement('div');
            el.className = `anime-preview-item${hasNew ? ' has-new' : ''}`;
            el.innerHTML = `
                <div class="ap-thumb-wrap">
                    <img src="${anime.thumbnail || 'icons/icono chrome.png'}" class="ap-thumb" onerror="this.src='icons/icono chrome.png'">
                    ${hasNew ? `
                    <div class="shimmer"></div>
                    <div class="badge-count" style="top: -6px; right: -6px;">${anime.newEpisodes || '!'}</div>
                    ` : ''}
                </div>
                <div class="ap-info">
                    <div class="ap-title" title="${anime.title || ''}">${anime.title || 'Sin título'}${sourceDot}</div>
                    <div class="ap-ep">${newLabel}</div>
                </div>
                <div class="ap-actions">
                    <button class="btn-sm btn-play" data-url="${anime.url}">▶</button>
                    <button class="btn-sm btn-ghost" data-unfollow="${anime.id}">🔕</button>
                </div>
            `;
            container.appendChild(el);
        } else {
            // Full following style
            const el = document.createElement('div');
            el.className = `full-anime-item${hasNew ? ' has-new' : ''}`;
            el.innerHTML = `
                <div style="position: relative; flex-shrink: 0;" class="fa-thumb-wrap">
                    <img src="${anime.thumbnail || 'icons/icono chrome.png'}" class="fa-thumb" onerror="this.src='icons/icono chrome.png'">
                    ${hasNew ? `
                    <div class="shimmer"></div>
                    <div class="new-ribbon">NUEVO</div>
                    <div class="badge-count" style="top: -6px; right: -6px;">${anime.newEpisodes || '!'}</div>
                    ` : ''}
                </div>
                <div class="fa-info">
                    <div class="fa-title" title="${anime.title || ''}">${anime.title || 'Sin título'}${sourceDot}</div>
                    <div class="fa-ep">${newLabel}</div>
                </div>
                <div class="fa-actions">
                    <button class="btn-sm btn-play" data-url="${anime.url}">▶</button>
                    <button class="btn-sm btn-ghost" data-unfollow="${anime.id}">🔕</button>
                </div>
            `;
            container.appendChild(el);
        }
    });
}
// Delegated click on animes
document.addEventListener('click', async e => {
    const playBtn = e.target.closest('.btn-play');
    if (playBtn) {
        const url = playBtn.dataset.url;
        if (url) {
            chrome.tabs.create({ url });

            // Decrementar newEpisodes y avanzar progreso tal como el modal
            const { followedAnimes = [] } = await chrome.storage.local.get('followedAnimes');
            const animeIndex = followedAnimes.findIndex(a => a.url === url);
            if (animeIndex !== -1) {
                const anime = followedAnimes[animeIndex];
                const oldNewEps = anime.newEpisodes || 0;

                anime.newEpisodes = Math.max(0, oldNewEps - 1);

                if (oldNewEps > 0) {
                    anime.lastEpisode = (anime.lastEpisode || 0) + 1;
                }
                if (anime.newEpisodes === 0) {
                    anime.notified = true;
                }

                followedAnimes[animeIndex] = anime;
                await chrome.storage.local.set({ followedAnimes });
                // El renderizado se actualizará si hay listener, o recargamos:
                loadFollowedAnimes();
            }
            return;
        }
    }

    const unfollowBtn = e.target.closest('[data-unfollow]');
    if (unfollowBtn) {
        const id = unfollowBtn.dataset.unfollow;
        const { followedAnimes = [] } = await chrome.storage.local.get('followedAnimes');
        const anime = followedAnimes.find(a => a.id === id);
        const updated = followedAnimes.filter(a => a.id !== id);
        await chrome.storage.local.set({ followedAnimes: updated });
        showToast(`❌ Dejaste de seguir "${anime?.title || 'el anime'}"`);
        loadFollowedAnimes();
    }
});

// ═══════════════════════════════════════ NOTIFICATION SETTINGS
async function loadNotifSettings() {
    const { notificationSettings = {} } = await chrome.storage.sync.get('notificationSettings');
    setToggle('notifyEnabled', notificationSettings.enabled !== false);
    setToggle('notifyNewEpisode', notificationSettings.notifyNewEpisode !== false);
    setToggle('soundEnabled', notificationSettings.soundEnabled !== false);
    setToggle('quietHoursEnabled', notificationSettings.quietHoursEnabled !== false);
}

async function saveNotifSettings() {
    const settings = {
        enabled: document.getElementById('notifyEnabled')?.checked ?? true,
        quietHoursEnabled: document.getElementById('quietHoursEnabled')?.checked ?? true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        notifyNewEpisode: document.getElementById('notifyNewEpisode')?.checked ?? true,
        soundEnabled: document.getElementById('soundEnabled')?.checked ?? true,
    };
    await chrome.storage.sync.set({ notificationSettings: settings });
    showToast('✅ Configuración guardada');
}

['notifyEnabled', 'quietHoursEnabled', 'notifyNewEpisode', 'soundEnabled'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', saveNotifSettings);
});

// ═══════════════════════════════════════ MANAGE BTN
document.getElementById('manageBtn')?.addEventListener('click', () => {
    chrome.windows.create({
        url: chrome.runtime.getURL('manage_animes.html'),
        type: 'popup',
        width: 1200,
        height: 800,
        left: 100,
        top: 50
    });
});

// ═══════════════════════════════════════ REFRESH BTN
document.getElementById('refreshBtn')?.addEventListener('click', () => {
    const icon = document.getElementById('refresh-icon');
    icon.innerHTML = '<span class="spinning">🔄</span>';
    chrome.runtime.sendMessage({ type: 'manualCheck' }, response => {
        icon.textContent = '🔄';
        if (response?.success) {
            showToast('✅ Verificación completada');
            setTimeout(() => loadFollowedAnimes(), 500);
        } else {
            showToast('⚠️ Error en verificación');
        }
    });
});

// ═══════════════════════════════════════ TOAST
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════ BIND ALL TOGGLES
function bindAllToggles() {
    bindToggle('skipIntro', 'autoSkipIntro', v => document.getElementById('chip-intro')?.classList.toggle('active', v));
    bindToggle('skipRecap', 'autoSkipRecap', v => document.getElementById('chip-recap')?.classList.toggle('active', v));
    bindToggle('skipEnding', 'autoSkipEnding', v => document.getElementById('chip-ending')?.classList.toggle('active', v));
    bindToggle('showSkipButtons', 'showSkipButtons');
    bindToggle('theaterMode', 'theaterMode');
    bindToggle('miniPlayer', 'miniPlayerEnabled', v => {
        chrome.runtime.sendMessage({ type: 'MINI_PLAYER_TOGGLE', enabled: v });
    });
    bindToggle('calendarFilter', 'calendarFilter');
    bindToggle('nextEpisodeDate', 'nextEpisodeDate');
}

// ═══════════════════════════════════════ MISC
function setAppVersion() {
    const manifest = chrome.runtime.getManifest();
    const verEl = document.getElementById('appVersion');
    if (verEl && manifest.version) {
        verEl.textContent = `v${manifest.version} · Power Up`;
    }
}

function initResetBtn() {
    const btn = document.getElementById('resetConfigBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres restarurar toda la configuración de la extensión por defecto? Esto no borrará tus animes seguidos.')) {
            chrome.storage.sync.set(DEFAULT_CONFIG, () => {
                showToast('🔄 Configuración reiniciada');
                setTimeout(() => window.location.reload(), 800);
            });
        }
    });
}

// ═══════════════════════════════════════════ API STATUS
async function loadApiStatus() {
    const { apiStatus } = await chrome.storage.local.get('apiStatus');
    if (!apiStatus) return;

    const rssIcon = document.getElementById('rss-status-icon');
    const rssText = document.getElementById('rss-status-text');
    const anilistIcon = document.getElementById('anilist-status-icon');
    const anilistText = document.getElementById('anilist-status-text');
    const lastCheckEl = document.getElementById('api-last-check');

    if (rssIcon && rssText) {
        if (apiStatus.rss === 'ok') {
            rssIcon.textContent = '✅';
            rssText.textContent = 'Activo';
        } else {
            rssIcon.textContent = '⚠️';
            rssText.textContent = 'Error';
        }
    }

    if (anilistIcon && anilistText) {
        if (apiStatus.anilist === 'ok') {
            anilistIcon.textContent = '✅';
            anilistText.textContent = 'Activo';
        } else {
            anilistIcon.textContent = '⚠️';
            anilistText.textContent = 'Error';
        }
    }

    if (lastCheckEl && apiStatus.lastCheck) {
        const ago = Math.round((Date.now() - apiStatus.lastCheck) / 60000);
        lastCheckEl.textContent = ago < 1 ? 'Última verificación: justo ahora' : `Última verificación: hace ${ago} min`;
    }
}

// ═══════════════════════════════════════════ INIT
document.addEventListener('DOMContentLoaded', () => {
    setAppVersion();
    initChips();
    loadConfig();
    loadFollowedAnimes();
    loadNotifSettings();
    loadApiStatus();
    bindAllToggles();
    initResetBtn();
});
