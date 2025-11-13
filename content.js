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
let anilistButtonHandler = null; // Handler for the anilist button

// Default settings
const defaultSettings = {
    anilistButton: false,
    theaterMode: false,
    nextEpisodeDate: true,
    skip_event_intro: 0,    // Modo manual por defecto
    skip_event_recap: 0,    // Modo manual por defecto  
    skip_event_ending: 0,   // Modo manual por defecto
    auto_skip: 0,
    hide_skip_button: 0,
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

        // Initialize AniList Button feature
        initializeAnilistButton();
        
        // Send status to popup
        chrome.runtime.sendMessage({
            type: 'status',
            skippersActive: !!skippersHandler,
            currentUrl: window.location.href
        });
    });

    // Observador de navegación para SPA
    observeNavigation();
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

            // Reinsert next episode date overlay when enabling the mini player.  On some pages
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
        skippersHandler = new SkippersHandler();
        console.log("Crunchyroll Power Up: SkippersHandler created");
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

function cleanupControlsSync() {
    if (controlsVisibilityObserver) {
        controlsVisibilityObserver.disconnect();
        controlsVisibilityObserver = null;
    }
    
    if (mouseInactivityTimeout) {
        clearTimeout(mouseInactivityTimeout);
        mouseInactivityTimeout = null;
    }
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
    
    console.log("Crunchyroll Power Up: Syncing all buttons visibility:", shouldBeVisible);
    
    // Sync skip buttons (current active button)
    if (currentActiveButton) {
        syncButtonVisibility(currentActiveButton, shouldBeVisible);
    }
    
    // Sync mini player button
    if (skippersHandler && skippersHandler.miniPlayerButton) {
        syncButtonVisibility(skippersHandler.miniPlayerButton, shouldBeVisible && chromeStorage.miniPlayerEnabled);
    }
    
    // Sync screen size buttons
    if (window.crunchyPowerUpScreenSizeButtons && window.crunchyPowerUpScreenSizeButtons.buttonsContainer) {
        syncButtonVisibility(window.crunchyPowerUpScreenSizeButtons.buttonsContainer, shouldBeVisible && chromeStorage.theaterMode);
    }
    
    lastControlsVisibility = shouldBeVisible;
}

function syncButtonVisibility(button, shouldBeVisible) {
    if (!button) return;
    
    if (shouldBeVisible) {
        button.classList.remove('sync-hidden');
    } else {
        button.classList.add('sync-hidden');
    }
}

// Go to specific time in video
function goToTime(time, skipType = null) {
    console.log("Crunchyroll Power Up: goToTime called with time:", time, "type:", skipType);
    
    if (videoElement) {
        videoElement.currentTime = time;
        console.log("Crunchyroll Power Up: Video time set to:", time);
        
        // Show notification
        if (skipType) {
            showNotification(null, skipType, time);
        } else {
            // Auto-detect type based on time
            let detectedType = 'intro';
            if (time <= 30) {
                detectedType = 'recap';
            } else if (time >= videoElement.duration - 120) {
                detectedType = 'ending';
            }
            showNotification(null, detectedType, time);
        }
    }
}

// Show notification
function showNotification(message, skipType = null, time = null) {
    console.log("Crunchyroll Power Up: showNotification called:", { message, skipType, time });
    
    // Use unified format if skipType and time provided
    let displayMessage = message;
    if (skipType && time !== null) {
        // Convert time to mm:ss format
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Type names
        const typeNames = {
            'recap': 'Recap',
            'intro': 'Intro', 
            'ending': 'Ending'
        };
        
        displayMessage = `${typeNames[skipType] || 'Segment'} (${timeString})`;
    }
    
    // Remove existing notification
    const existingNotification = document.querySelector('.crunchyroll-power-up-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'crunchyroll-power-up-notification cp-btn';
    
    // Set icon based on skip type
    let iconColor = '#4CAF50';
    if (skipType === "recap") {
        iconColor = '#FF9800';
    } else if (skipType === "intro") {
        iconColor = '#2196F3';
    } else if (skipType === "ending") {
        iconColor = '#9C27B0';
    }
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${iconColor}">
                <path d="M9,16.17L4.83,12l-1.42,1.41L9,19L21,7l-1.41-1.41L9,16.17z"/>
            </svg>
            <span>${displayMessage}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Base Skipper class
class NativeSkipper {
    skipped = false;
    
    constructor(start, end, type) {
        this.start = start;
        this.end = end;
        this.type = type;
        if (type) {
            this.key = `skip_event_${type}`;
        }
        console.log("Crunchyroll Power Up: NativeSkipper created:", { start, end, type, key: this.key });
    }
    
    click() {
        console.log("Crunchyroll Power Up: NativeSkipper click - skipping from", this.start, "to", this.end);
        this.skipped = true;
        
        // Get skip type for notification
        const skipType = this.key ? this.key.replace("skip_event_", "") : null;
        goToTime(this.end, skipType);
    }
    
    check(currentTime) {
        const isInPeriod = currentTime >= this.start && this.end > currentTime + 1;
        
        // Auto-skip logic
        if (isInPeriod && this.isAutoSkip()) {
            console.log("Crunchyroll Power Up: Auto-skipping detected for", this.key);
            this.click();
            return true;
        }
        
        return isInPeriod;
    }
    
    isAutoSkip() {
        // Value 1 = Auto Skip (checkbox checked)
        const value = chromeStorage[this.key];
        return value === 1;
    }
    
    reset() {
        this.skipped = false;
    }
}

// Skippers Handler class
class SkippersHandler {
    constructor() {
        this.skippers = [];
        this.videoElement = null;
        this.checkInterval = null;
        this.isChecking = false;
        this.miniPlayerButton = null;
    }
    
    init(video) {
        console.log("Crunchyroll Power Up: SkippersHandler init");
        this.videoElement = video;
        this.loadSkippersData();
        this.startChecking();
        this.showMiniPlayerButton(); // Agregar el botón de minireproductor
    }
    
    loadSkippersData() {
        // This would normally load from API or storage
        // For now, using placeholder data
        this.skippers = [
            new NativeSkipper(0, 90, 'intro'),
            new NativeSkipper(0, 30, 'recap'),
            new NativeSkipper(1200, 1320, 'ending')
        ];
        console.log("Crunchyroll Power Up: Skippers data loaded:", this.skippers.length, "skippers");
    }
    
    startChecking() {
        if (this.isChecking) return;
        
        this.isChecking = true;
        this.checkInterval = setInterval(() => {
            this.checkSkippers();
        }, 1000);
        
        console.log("Crunchyroll Power Up: Started skippers checking");
    }
    
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isChecking = false;
        console.log("Crunchyroll Power Up: Stopped skippers checking");
    }
    
    checkSkippers() {
        if (!this.videoElement) return;
        
        const currentTime = this.videoElement.currentTime;
        let activeSkipper = null;
        
        for (const skipper of this.skippers) {
            if (skipper.check(currentTime)) {
                activeSkipper = skipper;
                break;
            }
        }
        
        this.showSkipButton(activeSkipper);
    }
    
    showSkipButton(skipper) {
        // Remove existing button
        this.removeSkipButton();
        
        if (!skipper || chromeStorage.hide_skip_button === 1) {
            return;
        }
        
        // Create skip button
        const button = document.createElement('button');
        button.id = 'crunchyroll-powerup-skip-btn';
        button.className = 'cp-btn skip-btn';
        
        // Get message based on type
        let buttonText = 'Skip';
        if (skipper.type === 'intro') {
            buttonText = getMessage('skipIntro');
        } else if (skipper.type === 'recap') {
            buttonText = getMessage('skipRecap');
        } else if (skipper.type === 'ending') {
            buttonText = getMessage('skipEnding');
        }
        
        button.textContent = buttonText;
        button.addEventListener('click', () => skipper.click());
        
        // Style button - visible by default
        button.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: linear-gradient(135deg, #ff6b35, #ff914d);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0) scale(1);
        `;
        
        document.body.appendChild(button);
        currentActiveButton = button;
    }
    
    removeSkipButton() {
        if (currentActiveButton) {
            currentActiveButton.remove();
            currentActiveButton = null;
        }
    }
    
    skipActiveIfAny() {
        if (currentActiveButton) {
            currentActiveButton.click();
        }
    }
    
    showMiniPlayerButton() {
        // Solo mostrar si el miniplayer está habilitado
        if (!chromeStorage.miniPlayerEnabled) {
            return;
        }
        
        // Remover botón existente
        this.removeMiniPlayerButton();
        
        // Crear nuevo botón de minireproductor
        const button = document.createElement('button');
        button.id = 'crunchyroll-powerup-miniplayer-btn';
        button.className = 'cp-btn miniplayer-btn';
        button.textContent = 'Minireproductor';
    button.setAttribute('aria-label', 'Activar Picture-in-Picture');
    button.setAttribute('title', 'Activar Picture-in-Picture');
        
        button.addEventListener('click', () => this.activatePictureInPicture());
        
        // Estilo específico para el botón de minireproductor (posición izquierda) - visible by default
        button.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 20px;
            background: linear-gradient(135deg, #ff6b35, #ff914d);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            border: 2px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            opacity: 1;
            pointer-events: auto;
            transform: scale(1);
        `;
        
        // Efectos hover
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.35)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });
        
        document.body.appendChild(button);
        this.miniPlayerButton = button;
    }
    
    removeMiniPlayerButton() {
        if (this.miniPlayerButton) {
            this.miniPlayerButton.remove();
            this.miniPlayerButton = null;
        }
    }
    
    activatePictureInPicture() {
        if (!this.videoElement) {
            console.warn("Crunchyroll Power Up: No hay elemento de vídeo disponible para PiP");
            return;
        }
        
    console.log("Crunchyroll Power Up: Activando Picture-in-Picture");
        
        // Verificar si PiP está disponible
        if (!document.pictureInPictureEnabled) {
            console.warn("Crunchyroll Power Up: Picture-in-Picture no es compatible");
            showNotification("Picture-in-Picture no está disponible");
            return;
        }
        
        // Si ya está en PiP, salir del modo PiP
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture()
                .then(() => {
                    console.log("Crunchyroll Power Up: Salió del Picture-in-Picture");
                    showNotification("Salió del minireproductor");
                })
                .catch((err) => {
                    console.error("Crunchyroll Power Up: Error exiting PiP:", err);
                });
        } else {
            // Activar PiP
            this.videoElement.requestPictureInPicture()
                .then(() => {
                    console.log("Crunchyroll Power Up: Entró en Picture-in-Picture");
                    showNotification("Minireproductor activado");
                })
                .catch((err) => {
                    console.error("Crunchyroll Power Up: Error entering PiP:", err);
                    showNotification("Error al activar minireproductor");
                });
        }
    }
    
    
    cleanup() {
        this.stopChecking();
        this.removeSkipButton();
        this.removeMiniPlayerButton();
    }
}

// Next episode date functionality
function handleNextEpisodeDateFeature() {
    // Prevent multiple simultaneous initializations
    if (isNextEpisodeDateFeatureInitializing) {
        console.log("Crunchyroll Power Up: La función Fecha del próximo episodio ya se está inicializando, omitiendo.");
        return;
    }
    isNextEpisodeDateFeatureInitializing = true;

    // Disconnect any existing observer before starting a new one
    if (nextEpisodeDateFeatureObserver) {
        nextEpisodeDateFeatureObserver.disconnect();
        nextEpisodeDateFeatureObserver = null;
    }

    // Check if we're on a series page
    const seriesMatch = window.location.pathname.match(/(?<=\/series\/)[^\/]*/);
    if (!seriesMatch) {
        console.log("Crunchyroll Power Up: No estamos en una página de serie, omitiendo la función Fecha del próximo episodio.");
        // Ensure any existing instance is destroyed if we navigate away from a series page
        if (window.currentEpisodeAirDateInstance) {
            window.currentEpisodeAirDateInstance.destroy();
            window.currentEpisodeAirDateInstance = null;
        }
        isNextEpisodeDateFeatureInitializing = false;
        return;
    }

    const seriesId = seriesMatch[0];
    if (!seriesId) {
        console.log("Crunchyroll Power Up: No se pudo extraer el ID de la serie, omitiendo la función Fecha del próximo episodio.");
        isNextEpisodeDateFeatureInitializing = false;
        return;
    }

    // Check if feature is enabled
    if (chromeStorage.nextEpisodeDate) {
        console.log("Crunchyroll Power Up: La función Fecha del próximo episodio está habilitada.");

        // Ensure any existing instance is destroyed before trying to create a new one
        if (window.currentEpisodeAirDateInstance) {
            window.currentEpisodeAirDateInstance.destroy();
            window.currentEpisodeAirDateInstance = null;
        }

        // Use a MutationObserver to wait for the target element to appear
        const targetElementSelector = '.erc-series-hero-actions';
        nextEpisodeDateFeatureObserver = new MutationObserver((mutations, obs) => {
            const actionButtons = document.querySelector(targetElementSelector);
            if (actionButtons) {
                obs.disconnect(); // Stop observing once found
                nextEpisodeDateFeatureObserver = null;
                console.log("Crunchyroll Power Up: Elemento objetivo encontrado, inicializando EpisodeAirDate.");
                if (window.initializeEpisodeAirDate) {
                    window.initializeEpisodeAirDate(seriesId);
                } else {
                    console.warn("Crunchyroll Power Up: window.initializeEpisodeAirDate is not available.");
                }
                isNextEpisodeDateFeatureInitializing = false;
            }
        });

        // Start observing the body for changes
        nextEpisodeDateFeatureObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also check immediately in case the element is already there
        const actionButtons = document.querySelector(targetElementSelector);
        if (actionButtons) {
            nextEpisodeDateFeatureObserver.disconnect(); // Desconectar si se encontró inmediatamente
            nextEpisodeDateFeatureObserver = null;
            console.log("Crunchyroll Power Up: Elemento objetivo encontrado inmediatamente, inicializando EpisodeAirDate.");
            if (window.initializeEpisodeAirDate) {
                window.initializeEpisodeAirDate(seriesId);
            } else {
                console.warn("Crunchyroll Power Up: window.initializeEpisodeAirDate is not available.");
            }
            isNextEpisodeDateFeatureInitializing = false;
        }

    } else {
        console.log("Crunchyroll Power Up: La función Fecha del próximo episodio está deshabilitada, destruyendo cualquier instancia existente.");
        if (window.currentEpisodeAirDateInstance) {
            window.currentEpisodeAirDateInstance.destroy();
            window.currentEpisodeAirDateInstance = null;
        }
        isNextEpisodeDateFeatureInitializing = false;
    }
}

// Cleanup handler for the next episode date feature
function destroyNextEpisodeDate() {
    // The episodeAirDate module handles its own cleanup
    console.log("Crunchyroll Power Up: Solicitud de limpieza de EpisodeAirDate");
    if (window.currentEpisodeAirDateInstance) {
        window.currentEpisodeAirDateInstance.destroy();
        window.currentEpisodeAirDateInstance = null;
    }
}

// Determine whether the current page is a series or watch page
function isSeriesPage() {
    const url = window.location.href;
    return url.includes('/series/') || url.includes('/watch/');
}

// Cleanup handler for the next episode date feature
function destroyNextEpisodeDate() {
    // The episodeAirDate module handles its own cleanup
    console.log("Crunchyroll Power Up: EpisodeAirDate cleanup requested");
}

// Initialize AniList Button
function initializeAnilistButton() {
    if (chromeStorage.anilistButton) {
        if (!anilistButtonHandler) {
            anilistButtonHandler = new AnilistButtonHandler();
        }
        anilistButtonHandler.init();
    } else {
        if (anilistButtonHandler) {
            anilistButtonHandler.destroy();
            anilistButtonHandler = null;
        }
    }
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
        // Handle anilist button feature changes
        if (changes.anilistButton) {
            initializeAnilistButton();
        }
    }
});

// SPA Navigation Observer
function observeNavigation() {
    const titleElement = document.querySelector('head > title');
    if (!titleElement) return;

    const navigationObserver = new MutationObserver(() => {
        console.log("🔵 Crunchyroll Power Up: Navegación detectada (cambio de título). Reinicializando funciones.");

        // Da un pequeño margen para que el DOM se actualice tras la navegación
        setTimeout(() => {
            handleNextEpisodeDateFeature();
            initializeAnilistButton();
        }, 500);
    });

    navigationObserver.observe(titleElement, { childList: true });
}

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