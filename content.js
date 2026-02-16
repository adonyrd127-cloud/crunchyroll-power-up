// Extensión Crunchyroll Power Up - Script de contenido
// Autor: Ing. Adony R.
console.log("Crunchyroll Power Up: Script de contenido cargado");

// Global variables
let chromeStorage = {};
let videoElement = null;
let skippersHandler = null;
let currentActiveButton = null;
let controlsVisibilityObserver = null;
let mouseInactivityTimeout = null;
let lastControlsVisibility = true;
let isNextEpisodeDateFeatureInitializing = false; // New flag to prevent multiple initializations
let nextEpisodeDateFeatureObserver = null; // Observer for next episode date feature

// Default settings
const defaultSettings = {
    theaterMode: false,
    nextEpisodeDate: true,
    autoSkipIntro: false,
    autoSkipRecap: false,
    autoSkipEnding: false,
    autoSkipOutro: false,
    miniPlayerEnabled: true // Minireproductor habilitado por defecto
};

// Mensajes de internacionalización
const i18nMessages = {
    es: {
        skipRecap: ">> Saltar resumen",
        skipIntro: ">> Saltar intro",
        skipEnding: ">> Saltar final"
    },
    en: {
        // Mantener compatibilidad con usuarios que prefieren la interfaz en inglés
        skipRecap: ">> Skip recap",
        skipIntro: ">> Skip intro",
        skipEnding: ">> Skip ending"
    },
    ja: {
        skipRecap: ">> 要約をスキップ",
        skipIntro: ">> イントロをスキップ",
        skipEnding: ">> エンディングをスキップ"
    }
};

// Obtener el idioma actual
function getCurrentLanguage() {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('ja')) return 'ja';
    return 'en';
}

// Get localized message
function getMessage(key) {
    const lang = getCurrentLanguage();
    return i18nMessages[lang]?.[key] || i18nMessages.en[key] || key;
}

// Expose to window for other scripts
window.getMessage = getMessage;

// Expose syncAllButtonsVisibility after it's defined (deferred)
// The actual function definition is later in the file, this sets it once init() runs.

// Inicializar la extensión
function init() {
    console.log("Crunchyroll Power Up: Inicializando extensión");
    console.log("🟠 Manejador de skippers:", skippersHandler ? "Activo" : "No activo");

    loadConfig().then(() => {
        console.log("Crunchyroll Power Up: Configuración cargada, iniciando inicialización");

        // Apply theater mode if enabled
        if (chromeStorage.theaterMode) {
            enableTheaterMode();
        }

        // Initialize video detection
        detectVideo();

        // Initialize next episode date feature
        handleNextEpisodeDateFeature();

        // Initialize Mini Player feature
        initializeMiniPlayer();

        // Initialize Screen Size Buttons feature
        initializeScreenSizeButtons();

        // Start hiding Crunchyroll's native skip buttons
        startNativeSkipButtonHider();

        // Send status to popup
        chrome.runtime.sendMessage({
            type: 'status',
            skippersActive: !!skippersHandler,
            currentUrl: window.location.href
        });
    });
}

// =====================================================
// HIDE CRUNCHYROLL'S NATIVE SKIP BUTTON
// Uses text-content matching because CR uses hashed
// class names that change unpredictably.
// Runs in ALL frames (main + iframe) via all_frames:true
// SAFE: Only hides actual button-like elements, never
// parent containers that could include the video player.
// =====================================================
let nativeSkipHiderObserver = null;

const SKIP_TEXT_PATTERNS = [
    /^(>>?\|?\s*)?(skip|saltar|pular)\s*(intro|opening|cr[eé]ditos|credits|recap|resumen|ending|abertura)\s*$/i
];

function hideNativeSkipButtons() {
    // Only target actual interactive elements — NEVER divs that could be containers
    const candidates = document.querySelectorAll('button, [role="button"]');

    candidates.forEach(el => {
        // NEVER hide our own button
        if (el.id === 'crunchyroll-powerup-skip-btn') return;
        if (el.classList && el.classList.contains('crunchyroll-power-up-skipper')) return;
        // Already hidden by us
        if (el.getAttribute('data-cpu-hidden') === 'true') return;

        // Get ONLY the element's direct text (short, no descendants bloat)
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length > 40) return;

        const isSkip = SKIP_TEXT_PATTERNS.some(p => p.test(text));
        if (!isSkip) return;

        // Final safety: make sure this element is NOT a parent/ancestor of our button
        if (el.querySelector && el.querySelector('#crunchyroll-powerup-skip-btn')) return;
        if (el.querySelector && el.querySelector('.crunchyroll-power-up-skipper')) return;

        console.log('🟠 CPU: Hiding native skip button:', text, el.tagName, el.className);
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('data-cpu-hidden', 'true');
    });
}

function startNativeSkipButtonHider() {
    // Run immediately
    hideNativeSkipButtons();

    // Watch for DOM changes (CR adds the skip button dynamically)
    if (nativeSkipHiderObserver) return;

    nativeSkipHiderObserver = new MutationObserver((mutations) => {
        // Only re-scan if nodes were actually added (not attribute changes)
        for (const m of mutations) {
            if (m.addedNodes.length > 0) {
                hideNativeSkipButtons();
                return;
            }
        }
    });

    nativeSkipHiderObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
}

// Initialize Enhanced Mini Player
function initializeMiniPlayer() {
    if (window.crunchyPowerUpEnhancedMiniPlayer) {
        console.log("Crunchyroll Power Up: Inicializando Minireproductor mejorado");
        // Enhanced mini player initializes itself, but we can set enabled state
        if (chromeStorage.miniPlayerEnabled !== undefined) {
            window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(chromeStorage.miniPlayerEnabled);
        }
    } else {
        // Wait for Enhanced Mini Player module to load
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.crunchyPowerUpEnhancedMiniPlayer) {
                console.log("Crunchyroll Power Up: Módulo Minireproductor cargado, configurando");
                clearInterval(checkInterval);

                // Handle configuration
                if (chromeStorage.miniPlayerEnabled !== undefined) {
                    window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(chromeStorage.miniPlayerEnabled);
                }
            } else if (attempts >= maxAttempts) {
                console.log("Crunchyroll Power Up: Módulo Minireproductor no disponible después de", maxAttempts, "intentos");
                clearInterval(checkInterval);
            }
        }, 500);
    }
}

// Initialize Screen Size Buttons feature
function initializeScreenSizeButtons() {
    if (window.crunchyPowerUpScreenSizeButtons) {
        console.log("Crunchyroll Power Up: Inicializando botones de tamaño de pantalla");
        // Set enabled state based on theater mode setting
        window.crunchyPowerUpScreenSizeButtons.setEnabled(chromeStorage.theaterMode);
    } else {
        // Wait for Screen Size Buttons module to load
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.crunchyPowerUpScreenSizeButtons) {
                console.log("Crunchyroll Power Up: Módulo Botones Tamaño Pantalla cargado, configurando");
                clearInterval(checkInterval);

                // Set enabled state based on theater mode setting
                window.crunchyPowerUpScreenSizeButtons.setEnabled(chromeStorage.theaterMode);
            } else if (attempts >= maxAttempts) {
                console.log("Crunchyroll Power Up: Módulo Botones Tamaño Pantalla no disponible después de", maxAttempts, "intentos");
                clearInterval(checkInterval);
            }
        }, 500);
    }
}

// Load configuration from storage
async function loadConfig() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(defaultSettings, (result) => {
            chromeStorage = { ...defaultSettings, ...result };
            window.chromeStorage = chromeStorage; // Expose globally
            console.log("Crunchyroll Power Up: Configuración cargada:", chromeStorage);
            resolve();
        });
    });
}

// Save configuration to storage
function saveConfig(key, value) {
    chrome.storage.sync.set({ [key]: value }, () => {
        chromeStorage[key] = value;
        console.log(`Crunchyroll Power Up: Config guardada: ${key} = ${value}`);
    });
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Crunchyroll Power Up: Mensaje recibido:", message);

    switch (message.type) {
        case 'getStatus':
            sendResponse({
                skippersActive: !!skippersHandler,
                currentUrl: window.location.href,
                miniPlayerEnabled: chromeStorage.miniPlayerEnabled
            });
            break;

        case 'skipActive':
            if (skippersHandler) {
                skippersHandler.skipActiveIfAny();
            }
            break;

        case 'configChanged':
            chromeStorage = { ...chromeStorage, ...message.config };
            console.log("Crunchyroll Power Up: Configuración actualizada:", chromeStorage);

            // Handle Enhanced Mini Player config change
            if ('miniPlayerEnabled' in message.config && window.crunchyPowerUpEnhancedMiniPlayer) {
                window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(message.config.miniPlayerEnabled);
            }

            // Manejar cambio de configuración del botón minireproductor
            if ('miniPlayerEnabled' in message.config && skippersHandler) {
                if (message.config.miniPlayerEnabled) {
                    skippersHandler.showMiniPlayerButton();
                } else {
                    skippersHandler.removeMiniPlayerButton();
                }
            }
            break;

        case 'MINI_PLAYER_TOGGLE':
            console.log("Crunchyroll Power Up: Toggle de Minireproductor recibido:", message.enabled);
            chromeStorage.miniPlayerEnabled = message.enabled;
            if (window.crunchyPowerUpEnhancedMiniPlayer) {
                window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(message.enabled);
            }

            // Manejar también el botón de minireproductor
            if (skippersHandler) {
                if (message.enabled) {
                    skippersHandler.showMiniPlayerButton();
                } else {
                    skippersHandler.removeMiniPlayerButton();
                }
            }

            // Reinsert next episode date overlay when enabling the mini player. On some pages
            // the mini player can modify the DOM and remove the `.next-air-date` element.
            // If the feature is still enabled, ensure the date is added again after toggling.
            if (chromeStorage.nextEpisodeDate) {
                // Delay slightly to allow mini player modifications to settle
                setTimeout(() => {
                    handleNextEpisodeDateFeature();
                }, 500);
            }
            break;

        case 'pageLoaded':
            console.log("Crunchyroll Power Up: Page loaded message received.");
            handleNextEpisodeDateFeature();
            break;
    }
});

// Theater mode functionality
function enableTheaterMode() {
    console.log("Crunchyroll Power Up: Activando modo teatro");
    setTimeout(() => {
        const theaterButton = document.querySelector('[data-testid="theater-mode-button"], .theater-mode-button, [aria-label*="theater"], [aria-label*="Theater"]');
        if (theaterButton && !theaterButton.classList.contains('active')) {
            theaterButton.click();
            console.log("Crunchyroll Power Up: Botón modo teatro pulsado");
        }
    }, 2000);
}

// Video detection and initialization
function detectVideo() {
    const video = document.querySelector('video');
    if (video && video !== videoElement) {
        videoElement = video;
        console.log("Crunchyroll Power Up: Video detected, initializing features");
        initializeVideoFeatures();
    }

    // Continue checking for video
    setTimeout(detectVideo, 1000);
}

// Initialize video-related features
function initializeVideoFeatures() {
    if (!videoElement) return;

    // Initialize skippers handler
    if (!skippersHandler) {
        // skippersHandler is global variable in content.js, 
        // but the CLASS definition is gone. We instantiate it below.
        if (window.CrunchyrollPowerUpSkippersHandler) {
            skippersHandler = new window.CrunchyrollPowerUpSkippersHandler();
            console.log("Crunchyroll Power Up: SkippersHandler created");
        } else {
            console.warn("Crunchyroll Power Up: CrunchyrollPowerUpSkippersHandler class not found on window.");
            return;
        }
    }

    skippersHandler.init(videoElement);



    // Initialize global controls visibility sync
    initializeControlsSync();
}

// Global controls synchronization system
function initializeControlsSync() {
    console.log("Crunchyroll Power Up: Initializing controls sync");

    // Clean up existing observers
    cleanupControlsSync();

    // Set up simple mouse detection for video area
    setupSimpleControlsSync();

    // Initial sync - show buttons by default
    syncAllButtonsVisibility(true);
}

function cleanupControlsSync() {
    if (controlsVisibilityObserver) {
        controlsVisibilityObserver.disconnect();
        controlsVisibilityObserver = null;
    }

    if (mouseInactivityTimeout) {
        clearTimeout(mouseInactivityTimeout);
        mouseInactivityTimeout = null;
    }

    // Remove mouse event listeners
    document.removeEventListener('mousemove', handleSimpleMouseActivity);
}

function setupSimpleControlsSync() {
    // Simple video area detection
    const videoContainer = document.querySelector('[data-testid="vilos-player"], .video-player, video');

    if (videoContainer) {
        videoContainer.addEventListener('mouseenter', () => {
            syncAllButtonsVisibility(true);
        });

        videoContainer.addEventListener('mouseleave', () => {
            // Delay hiding to prevent flickering
            setTimeout(() => {
                syncAllButtonsVisibility(false);
            }, 1000);
        });
    }

    // Also listen on document for general mouse activity
    document.addEventListener('mousemove', handleSimpleMouseActivity);
}

function handleSimpleMouseActivity() {
    // Clear existing timeout
    if (mouseInactivityTimeout) {
        clearTimeout(mouseInactivityTimeout);
    }

    // Show buttons on any mouse activity
    syncAllButtonsVisibility(true);

    // Hide after 4 seconds of inactivity
    mouseInactivityTimeout = setTimeout(() => {
        syncAllButtonsVisibility(false);
    }, 4000);
}

function syncAllButtonsVisibility(forceVisible = null) {
    // Default to visible if not specified
    const shouldBeVisible = forceVisible !== null ? forceVisible : true;

    // Sync skip buttons (current active button from handler)
    if (skippersHandler && skippersHandler.currentActiveButton) {
        // Always show skip button if it exists and we are hovering, 
        // OR if it's just been created (forceVisible might be null/true).
        // The user wants it to appear when mouse moves.
        syncButtonVisibility(skippersHandler.currentActiveButton, shouldBeVisible);
    } else if (window.currentActiveButton) {
        // Fallback to global if set
        syncButtonVisibility(window.currentActiveButton, shouldBeVisible);
    }

    // Sync mini player button
    if (skippersHandler && skippersHandler.miniPlayerButton) {
        syncButtonVisibility(skippersHandler.miniPlayerButton, shouldBeVisible && chromeStorage.miniPlayerEnabled);
    }

    // Screen size buttons: no sync needed — they are injected into the native
    // control bar and inherit Crunchyroll's own show/hide behavior.

    lastControlsVisibility = shouldBeVisible;
}

function syncButtonVisibility(button, shouldBeVisible) {
    if (!button) return;

    // specific hack: if button is in "temp auto show" mode, do not let sync hide it
    if (button.classList.contains('temp-auto-show')) {
        button.classList.remove('sync-hidden');
        button.style.opacity = '1';
        button.style.pointerEvents = 'none'; // Ensure click-through usually
        return;
    }

    if (shouldBeVisible) {
        button.classList.remove('sync-hidden');
        button.style.opacity = '1'; // Force opacity
        button.style.pointerEvents = 'auto';
    } else {
        button.classList.add('sync-hidden');
        button.style.opacity = '0'; // Force opacity
        button.style.pointerEvents = 'none';
    }
}

// Exponer al window para que SkipperHandler.js pueda invocar la sincronización
window.syncAllButtonsVisibility = syncAllButtonsVisibility;

// Next episode date functionality
function handleNextEpisodeDateFeature() {
    // Verificar si la feature está habilitada
    if (!chromeStorage.nextEpisodeDate) {
        console.log("Crunchyroll Power Up: La función Fecha del próximo episodio está deshabilitada");
        if (window.destroyEpisodeAirDate) {
            window.destroyEpisodeAirDate();
        }
        return;
    }

    // Delegar completamente a episodeAirDate.js
    // La detección de página /series/ se hace dentro de initializeEpisodeAirDate()
    if (window.initializeEpisodeAirDate) {
        window.initializeEpisodeAirDate();
    } else {
        console.warn("Crunchyroll Power Up: window.initializeEpisodeAirDate no está disponible");
    }
}

// Cleanup handler for the next episode date feature
function destroyNextEpisodeDate() {
    if (window.destroyEpisodeAirDate) {
        window.destroyEpisodeAirDate();
    }
}

// Determine whether the current page is a series or watch page
// Soporta URLs localizadas: /es/series/, /pt-br/watch/, etc.
function isSeriesPage() {
    const path = window.location.pathname;
    return /(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:series|watch)\//i.test(path);
}

// Listen for storage changes to update features dynamically
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log("Crunchyroll Power Up: El almacenamiento cambió:", changes);
        // Update local storage cache
        Object.keys(changes).forEach(key => {
            chromeStorage[key] = changes[key].newValue;
        });
        // Reinitialize skippers if necessary
        if (changes.skip_event_intro || changes.skip_event_recap || changes.skip_event_ending) {
            if (skippersHandler && videoElement) {
                skippersHandler.init(videoElement);
            }
        }
        // Apply theater mode if changed
        if (changes.theaterMode) {
            if (changes.theaterMode.newValue) {
                enableTheaterMode();
            }
            // Update Screen Size Buttons based on theater mode setting
            if (window.crunchyPowerUpScreenSizeButtons) {
                window.crunchyPowerUpScreenSizeButtons.setEnabled(changes.theaterMode.newValue);
            }
        }
        // Handle next episode date feature changes
        if (changes.nextEpisodeDate) {
            handleNextEpisodeDateFeature();
        }
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Limpiar al descargar la página
window.addEventListener('beforeunload', () => {
    if (skippersHandler) {
        skippersHandler.cleanup();
    }
    if (window.crunchyPowerUpEnhancedMiniPlayer) {
        window.crunchyPowerUpEnhancedMiniPlayer.destroy();
    }
    if (window.crunchyPowerUpScreenSizeButtons) {
        window.crunchyPowerUpScreenSizeButtons.destroy();
    }
    // Clean up global controls sync
    cleanupControlsSync();
});

console.log("Crunchyroll Power Up: Script de contenido listo");