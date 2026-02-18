// Script del popup para Crunchy+ Plus v1.6.32 - soporte i18n + Filtro de calendario
console.log("Crunchyroll Power Up Popup: Script cargado");

// Función i18n para obtener mensajes localizados
function getMessage(key) {
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key) || `__MSG_${key}__`;
        }
        return `__MSG_${key}__`;
    } catch (error) {
        console.warn("🟠 Error en i18n.getMessage:", error);
        return `__MSG_${key}__`;
    }
}

// Función para reemplazar marcadores i18n en el documento
function replaceI18nPlaceholders() {
    console.log("🌐 Reemplazando marcadores i18n...");

    // Set the correct language attribute
    let currentLocale = 'en';
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
            currentLocale = chrome.i18n.getUILanguage();
        } else {
            currentLocale = navigator.language || 'en';
        }
    } catch (error) {
        console.warn("🟠 Error en i18n.getUILanguage:", error);
        currentLocale = navigator.language || 'en';
    }
    document.documentElement.lang = currentLocale.startsWith('es') ? 'es' : 'en';
    console.log("🌐 Idioma establecido en:", document.documentElement.lang, "basado en la configuración regional:", currentLocale);

    // Obtener todos los nodos de texto y atributos que puedan contener __MSG_key__
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.includes('__MSG_')) {
            textNodes.push(node);
        }
    }

    // Reemplazar contenido de texto
    textNodes.forEach(textNode => {
        textNode.nodeValue = textNode.nodeValue.replace(/__MSG_(\w+)__/g, (match, key) => {
            return getMessage(key);
        });
    });

    // Reemplazar atributo title
    document.title = document.title.replace(/__MSG_(\w+)__/g, (match, key) => {
        return getMessage(key);
    });

    // Reemplazar otros atributos que puedan contener claves i18n
    const elementsWithI18n = document.querySelectorAll('[title*="__MSG_"], [alt*="__MSG_"], [placeholder*="__MSG_"]');
    elementsWithI18n.forEach(element => {
        ['title', 'alt', 'placeholder'].forEach(attr => {
            if (element.hasAttribute(attr)) {
                const value = element.getAttribute(attr);
                if (value.includes('__MSG_')) {
                    element.setAttribute(attr, value.replace(/__MSG_(\w+)__/g, (match, key) => {
                        return getMessage(key);
                    }));
                }
            }
        });
    });

    console.log("🌐 Marcadores i18n reemplazados");
}

// Configuración por defecto simple (camelCase standardized)
const DEFAULT_CONFIG = {
    autoSkipIntro: false,
    autoSkipRecap: false,
    autoSkipEnding: false,
    theaterMode: false,
    nextEpisodeDate: true,
    calendarFilter: false,
    miniPlayerEnabled: false
};

// Elementos del DOM
let skipIntroCheckbox, skipRecapCheckbox, skipEndingCheckbox;
let theaterModeCheckbox, nextEpisodeDateCheckbox, calendarFilterCheckbox, miniPlayerCheckbox;

// Inicializar popup
document.addEventListener('DOMContentLoaded', function () {
    console.log("🟠 Popup: DOM cargado, inicializando...");

    // PRIMERO: Reemplazar marcadores i18n
    replaceI18nPlaceholders();

    // Obtener referencias a los elementos
    skipIntroCheckbox = document.getElementById('skipIntro');
    skipRecapCheckbox = document.getElementById('skipRecap');
    skipEndingCheckbox = document.getElementById('skipEnding');
    theaterModeCheckbox = document.getElementById('theaterMode');
    nextEpisodeDateCheckbox = document.getElementById('nextEpisodeDate');
    calendarFilterCheckbox = document.getElementById('calendarFilter');
    miniPlayerCheckbox = document.getElementById('miniPlayer');

    // Cargar configuración guardada
    loadConfiguration();

    // Agregar event listeners
    setupEventListeners();

    // === ANIME TRACKING: Initialize section ===
    initFollowedAnimesSection();

    // === SKIP BUTTONS SETTING ===
    initSkipButtonsSetting();

    console.log("🟠 Popup: Inicialización completa");
});

// Cargar configuración desde storage
function loadConfiguration() {
    console.log("🟠 Popup: Cargando configuración...");

    chrome.storage.sync.get(DEFAULT_CONFIG, function (result) {
        console.log("🟠 Popup: Configuración cargada:", result);

        // Configuración estandarizada (booleana)
        skipIntroCheckbox.checked = result.autoSkipIntro;
        skipRecapCheckbox.checked = result.autoSkipRecap;
        skipEndingCheckbox.checked = result.autoSkipEnding;

        // Para otras opciones: usar valor booleano directo
        theaterModeCheckbox.checked = result.theaterMode;
        nextEpisodeDateCheckbox.checked = result.nextEpisodeDate;
        calendarFilterCheckbox.checked = result.calendarFilter;
        miniPlayerCheckbox.checked = result.miniPlayerEnabled;

        console.log("🟠 Popup: Checkboxes configurados");
        console.log("🟠 ✅ LÓGICA ESTANDARIZADA:");
        console.log("🟠 Marcado = Salto automático (true)");
        console.log("🟠 Desmarcado = Modo manual (false)");
        console.log("🔍 Filtro de Calendario:", result.calendarFilter ? "HABILITADO" : "DESHABILITADO");

        // Calendar dark mode
        const calendarDarkModeCheckbox = document.getElementById('calendarDarkMode');
        if (calendarDarkModeCheckbox) {
            calendarDarkModeCheckbox.checked = result.calendarDarkMode || false;
        }
    });
}

// Configurar event listeners
function setupEventListeners() {
    console.log("🟠 Popup: Configurando listeners de eventos...");

    // Skip checkboxes con lógica booleana directa
    skipIntroCheckbox.addEventListener('change', function () {
        saveConfig('autoSkipIntro', this.checked);
        console.log("🟠 Popup: Skip Intro cambiado a:", this.checked);
    });

    skipRecapCheckbox.addEventListener('change', function () {
        saveConfig('autoSkipRecap', this.checked);
        console.log("🟠 Popup: Skip Recap cambiado a:", this.checked);
    });

    skipEndingCheckbox.addEventListener('change', function () {
        saveConfig('autoSkipEnding', this.checked);
        console.log("🟠 Popup: Skip Ending cambiado a:", this.checked);
    });

    // Otras casillas
    theaterModeCheckbox.addEventListener('change', function () {
        saveConfig('theaterMode', this.checked);
        console.log("🟠 Popup: Theater Mode cambiado a:", this.checked);
    });

    nextEpisodeDateCheckbox.addEventListener('change', function () {
        saveConfig('nextEpisodeDate', this.checked);
        console.log("🟠 Popup: Next Episode Date cambiado a:", this.checked);
    });

    // NEW: Calendar Filter checkbox
    calendarFilterCheckbox.addEventListener('change', function () {
        saveConfig('calendarFilter', this.checked);
        console.log("🔍 Popup: Filtro de Calendario cambiado a:", this.checked);
    });

    // NEW: Mini Player checkbox
    miniPlayerCheckbox.addEventListener('change', function () {
        saveConfig('miniPlayerEnabled', this.checked);
        console.log("📺 Popup: Mini Reproductor cambiado a:", this.checked);

        // Enviar mensaje a content script para actualizar estado
        chrome.runtime.sendMessage({
            type: 'MINI_PLAYER_TOGGLE',
            enabled: this.checked
        });
    });

    // NEW: Calendar Dark Mode checkbox
    const calendarDarkModeCheckbox = document.getElementById('calendarDarkMode');
    if (calendarDarkModeCheckbox) {
        calendarDarkModeCheckbox.addEventListener('change', function () {
            chrome.storage.sync.set({ calendarDarkMode: this.checked });
            console.log("🌙 Popup: Modo Oscuro del Calendario cambiado a:", this.checked);
        });
    }

    console.log("🟠 Popup: Event listeners configurados");

    // Initialize UI visual state
    initializeUIState();
}

// Guardar configuración
function saveConfig(key, value) {
    const config = {};
    config[key] = value;

    chrome.storage.sync.set(config, function () {
        console.log("🟠 Popup: Config guardada:", key, "=", value);
        if (key.includes('autoSkip')) {
            console.log("🟠", value ? "✅ SALTO AUTOMÁTICO activado" : "🔧 MODO MANUAL activado");
        }
        if (key === 'calendarFilter') {
            console.log("🔍", value ? "✅ FILTRO DE CALENDARIO activado" : "🔧 FILTRO DE CALENDARIO desactivado");
        }
    });
}

// Función de depuración disponible en la consola del popup
window.crunchyPlusPopupDebug = function () {
    console.log("🔍 DEPURANDO CONFIGURACIÓN DEL POPUP");

    chrome.storage.sync.get(null, function (result) {
        console.log("📊 Almacenamiento completo:", result);

        Object.keys(result).forEach(key => {
            if (key.includes('autoSkip')) {
                console.log(`🔧 ${key}: ${result[key]}`);
            }
        });
    });

    return {
        skipIntro: skipIntroCheckbox?.checked,
        skipRecap: skipRecapCheckbox?.checked,
        skipEnding: skipEndingCheckbox?.checked,
        theaterMode: theaterModeCheckbox?.checked,
        nextEpisodeDate: nextEpisodeDateCheckbox?.checked,
        calendarFilter: calendarFilterCheckbox?.checked,
        miniPlayer: miniPlayerCheckbox?.checked
    };
};

// Funciones para actualizar la UI de elementos visuales (movidas desde script inline)
function updatePillButton(pill, checkbox) {
    if (checkbox.checked) {
        pill.classList.add('active');
    } else {
        pill.classList.remove('active');
    }
}

function updateSwitch(switchEl, checkbox) {
    if (checkbox.checked) {
        switchEl.classList.add('active');
    } else {
        switchEl.classList.remove('active');
    }
}

// Initialize UI visual state
function initializeUIState() {
    // Obtener elementos de tipo 'pill' (botones)
    const introPill = document.getElementById('intro-pill');
    const recapPill = document.getElementById('recap-pill');
    const endingPill = document.getElementById('ending-pill');

    // Obtener elementos tipo switch
    const theaterSwitch = document.getElementById('theater-switch');
    const episodeSwitch = document.getElementById('episode-switch');
    const calendarFilterSwitch = document.getElementById('calendar-filter-switch');
    const miniPlayerSwitch = document.getElementById('mini-player-switch');

    // Añadir listeners para actualizar la UI
    if (skipIntroCheckbox) {
        skipIntroCheckbox.addEventListener('change', () => updatePillButton(introPill, skipIntroCheckbox));
    }
    if (skipRecapCheckbox) {
        skipRecapCheckbox.addEventListener('change', () => updatePillButton(recapPill, skipRecapCheckbox));
    }
    if (skipEndingCheckbox) {
        skipEndingCheckbox.addEventListener('change', () => updatePillButton(endingPill, skipEndingCheckbox));
    }
    if (theaterModeCheckbox) {
        theaterModeCheckbox.addEventListener('change', () => updateSwitch(theaterSwitch, theaterModeCheckbox));
    }
    if (nextEpisodeDateCheckbox) {
        nextEpisodeDateCheckbox.addEventListener('change', () => updateSwitch(episodeSwitch, nextEpisodeDateCheckbox));
    }
    if (calendarFilterCheckbox) {
        calendarFilterCheckbox.addEventListener('change', () => updateSwitch(calendarFilterSwitch, calendarFilterCheckbox));
    }
    if (miniPlayerCheckbox) {
        miniPlayerCheckbox.addEventListener('change', () => updateSwitch(miniPlayerSwitch, miniPlayerCheckbox));
    }

    // Inicializar el estado visual una vez cargada la configuración
    setTimeout(() => {
        if (introPill && skipIntroCheckbox) updatePillButton(introPill, skipIntroCheckbox);
        if (recapPill && skipRecapCheckbox) updatePillButton(recapPill, skipRecapCheckbox);
        if (endingPill && skipEndingCheckbox) updatePillButton(endingPill, skipEndingCheckbox);
        if (theaterSwitch && theaterModeCheckbox) updateSwitch(theaterSwitch, theaterModeCheckbox);
        if (episodeSwitch && nextEpisodeDateCheckbox) updateSwitch(episodeSwitch, nextEpisodeDateCheckbox);
        if (calendarFilterSwitch && calendarFilterCheckbox) updateSwitch(calendarFilterSwitch, calendarFilterCheckbox);
        if (miniPlayerSwitch && miniPlayerCheckbox) updateSwitch(miniPlayerSwitch, miniPlayerCheckbox);
    }, 100);
}

// ============================================
// ANIME TRACKING: POPUP SECTION
// ============================================

async function initFollowedAnimesSection() {
    console.log('📺 Popup: Inicializando sección de animes seguidos...');
    await loadFollowedAnimes();
    await loadNotificationSettings();
    setupFollowedAnimesListeners();
}

async function loadFollowedAnimes() {
    try {
        const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');

        const animeList = document.getElementById('animeList');
        const emptyState = document.getElementById('emptyState');
        const totalFollowed = document.getElementById('totalFollowed');
        const manageBtn = document.getElementById('openManageAnimesBtn');
        const countBadge = document.getElementById('animeCountBadge');

        if (!animeList || !emptyState || !totalFollowed) return;

        totalFollowed.textContent = followedAnimes.length;

        if (followedAnimes.length === 0) {
            animeList.style.display = 'none';
            emptyState.style.display = 'block';
            if (manageBtn) manageBtn.style.display = 'none';
            return;
        }

        animeList.style.display = 'flex';
        emptyState.style.display = 'none';
        animeList.innerHTML = '';

        // Sort: most recently added first
        followedAnimes.sort((a, b) => (b.addedDate || 0) - (a.addedDate || 0));

        // Show only first 3 as preview
        const previewAnimes = followedAnimes.slice(0, 3);

        for (const anime of previewAnimes) {
            animeList.appendChild(createAnimeItem(anime));
        }

        // Show manage button with count
        if (manageBtn) {
            manageBtn.style.display = 'flex';
        }
        if (countBadge) {
            countBadge.textContent = followedAnimes.length;
        }

    } catch (error) {
        console.error('Error cargando animes seguidos:', error);
    }
}

function createAnimeItem(anime) {
    const item = document.createElement('div');
    item.className = 'anime-item';
    item.dataset.animeId = anime.id;

    item.innerHTML = `
        <img
            src="${anime.thumbnail || 'icons/icono chrome.png'}"
            alt="${anime.title || 'Anime'}"
            class="anime-thumb"
            onerror="this.src='icons/icono chrome.png'"
        >
        <div class="anime-info">
            <h3 class="anime-title" title="${anime.title || ''}">${anime.title || 'Sin título'}</h3>
            <p class="ep-status">Episodio ${anime.lastEpisode || '?'}</p>
        </div>
        <div class="anime-actions">
            <button class="btn-watch" data-url="${anime.url}" title="Ver anime">▶️</button>
            <button class="btn-unfollow" data-id="${anime.id}" title="Dejar de seguir">🔕</button>
        </div>
    `;

    return item;
}

async function loadNotificationSettings() {
    try {
        const { notificationSettings = {} } = await chrome.storage.sync.get('notificationSettings');

        const els = {
            notifyEnabled: document.getElementById('notifyEnabled'),
            quietHoursEnabled: document.getElementById('quietHoursEnabled'),
            notifyNewEpisode: document.getElementById('notifyNewEpisode'),
            soundEnabled: document.getElementById('soundEnabled'),
        };

        if (els.notifyEnabled) els.notifyEnabled.checked = notificationSettings.enabled !== false;
        if (els.quietHoursEnabled) els.quietHoursEnabled.checked = notificationSettings.quietHoursEnabled !== false;
        if (els.notifyNewEpisode) els.notifyNewEpisode.checked = notificationSettings.notifyNewEpisode !== false;
        if (els.soundEnabled) els.soundEnabled.checked = notificationSettings.soundEnabled !== false;

    } catch (error) {
        console.error('Error cargando configuración de notificaciones:', error);
    }
}

function setupFollowedAnimesListeners() {
    // Manual check button
    const manualCheckBtn = document.getElementById('manualCheckBtn');
    if (manualCheckBtn) {
        manualCheckBtn.addEventListener('click', () => {
            manualCheckBtn.style.pointerEvents = 'none';
            manualCheckBtn.textContent = '⏳';

            chrome.runtime.sendMessage({ type: 'manualCheck' }, (response) => {
                manualCheckBtn.textContent = '🔄';
                manualCheckBtn.style.pointerEvents = 'auto';

                if (response?.success) {
                    showPopupToast('✅ Verificación completada');
                    setTimeout(() => loadFollowedAnimes(), 800);
                } else {
                    showPopupToast('⚠️ Error en la verificación');
                }
            });
        });
    }

    // Delegated click handlers for anime items
    const animeList = document.getElementById('animeList');
    if (animeList) {
        animeList.addEventListener('click', async (e) => {
            const watchBtn = e.target.closest('.btn-watch');
            if (watchBtn) {
                const url = watchBtn.dataset.url;
                if (url) chrome.tabs.create({ url });
                return;
            }

            const unfollowBtn = e.target.closest('.btn-unfollow');
            if (unfollowBtn) {
                const animeId = unfollowBtn.dataset.id;
                if (animeId) await unfollowAnime(animeId);
            }
        });
    }

    // Notification settings checkboxes
    ['notifyEnabled', 'quietHoursEnabled', 'notifyNewEpisode', 'soundEnabled'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => saveNotificationSettings());
    });
}

async function unfollowAnime(animeId) {
    try {
        const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');
        const anime = followedAnimes.find(a => a.id === animeId);
        const title = anime?.title || 'el anime';

        const updated = followedAnimes.filter(a => a.id !== animeId);
        await chrome.storage.sync.set({ followedAnimes: updated });
        showPopupToast(`❌ Dejaste de seguir "${title}"`);
        await loadFollowedAnimes();

    } catch (error) {
        console.error('Error al dejar de seguir:', error);
        showPopupToast('❌ Error al actualizar');
    }
}

async function saveNotificationSettings() {
    try {
        const settings = {
            enabled: document.getElementById('notifyEnabled')?.checked ?? true,
            quietHoursEnabled: document.getElementById('quietHoursEnabled')?.checked ?? true,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            notifyNewEpisode: document.getElementById('notifyNewEpisode')?.checked ?? true,
            soundEnabled: document.getElementById('soundEnabled')?.checked ?? true,
        };
        await chrome.storage.sync.set({ notificationSettings: settings });
        showPopupToast('✅ Configuración guardada');
    } catch (error) {
        console.error('Error guardando configuración:', error);
        showPopupToast('❌ Error al guardar');
    }
}

function showPopupToast(message) {
    let toast = document.querySelector('.popup-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'popup-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// ============================================
// SKIP BUTTONS SETTING (showSkipButtons toggle)
// ============================================

function initSkipButtonsSetting() {
    const showSkipButtonsCheckbox = document.getElementById('showSkipButtons');
    const skipButtonsSwitch = document.getElementById('skip-buttons-switch');

    if (!showSkipButtonsCheckbox) return;

    // Load saved setting
    chrome.storage.sync.get('showSkipButtons', (data) => {
        const enabled = data.showSkipButtons !== undefined ? data.showSkipButtons : true;
        showSkipButtonsCheckbox.checked = enabled;
        if (skipButtonsSwitch) {
            skipButtonsSwitch.classList.toggle('active', enabled);
        }
    });

    // Save on change
    showSkipButtonsCheckbox.addEventListener('change', () => {
        const enabled = showSkipButtonsCheckbox.checked;
        chrome.storage.sync.set({ showSkipButtons: enabled });
        if (skipButtonsSwitch) {
            skipButtonsSwitch.classList.toggle('active', enabled);
        }
        showPopupToast(enabled ? '✅ Botones de salto activados' : '🔕 Botones de salto desactivados');
    });
}

// ============================================
// OPEN MANAGE ANIMES MODAL (Full Screen)
// ============================================

function openManageAnimesModal() {
    chrome.windows.create({
        url: chrome.runtime.getURL('manage_animes.html'),
        type: 'popup',
        width: 1200,
        height: 800,
        left: 100,
        top: 50
    });
}

document.getElementById('openManageAnimesBtn')?.addEventListener('click', () => {
    openManageAnimesModal();
});

console.log("Crunchyroll Power Up Popup: Script cargado + AniSkip Hybrid System");
