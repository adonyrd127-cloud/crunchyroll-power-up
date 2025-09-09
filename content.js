// Crunchyroll Power Up Extension - Content Script
// Author: Ing. Adony R.
console.log("🟠 Crunchyroll Power Up: Content script loaded");

// Global variables
let chromeStorage = {};
let videoElement = null;
let skippersHandler = null;
let currentActiveButton = null;
let controlsVisibilityObserver = null;
let mouseInactivityTimeout = null;
let lastControlsVisibility = true;

// Default settings
const defaultSettings = {
    theaterMode: false,
    nextEpisodeDate: true,
    skip_event_intro: 0,    // Manual mode by default
    skip_event_recap: 0,    // Manual mode by default  
    skip_event_ending: 0,   // Manual mode by default
    auto_skip: 0,
    hide_skip_button: 0,
    miniPlayerEnabled: true // Mini Player enabled by default
};

// Internationalization messages
const i18nMessages = {
    es: {
        skipRecap: ">> Saltar resumen",
        skipIntro: ">> Saltar intro", 
        skipEnding: ">> Saltar final"
    },
    en: {
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

// Get current language
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

// Initialize extension
function init() {
    console.log("🟠 Crunchyroll Power Up: Initializing extension");
    
    loadConfig().then(() => {
        console.log("🟠 Crunchyroll Power Up: Config loaded, starting initialization");
        
        if (chromeStorage.theaterMode) {
            enableTheaterMode();
        }
        
        detectVideo();
        
        if (chromeStorage.nextEpisodeDate) {
            addNextEpisodeDate();
        }
        
        initializeMiniPlayer();
        initializeScreenSizeButtons();
        
        // Send status to background
        try {
            chrome.runtime.sendMessage({
                type: 'status',
                skippersActive: !!skippersHandler,
                currentUrl: window.location.href
            });
        } catch (error) {
            console.log("🟠 Crunchyroll Power Up: Could not send message to background:", error);
        }
    });
}

// Load configuration from storage
async function loadConfig() {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(defaultSettings, (result) => {
                chromeStorage = { ...defaultSettings, ...result };
                console.log("🟠 Crunchyroll Power Up: Config loaded:", chromeStorage);
                resolve();
            });
        } catch (error) {
            console.log("🟠 Crunchyroll Power Up: Error loading config, using defaults:", error);
            chromeStorage = { ...defaultSettings };
            resolve();
        }
    });
}

// Save configuration to storage
function saveConfig(key, value) {
    try {
        chrome.storage.sync.set({ [key]: value }, () => {
            chromeStorage[key] = value;
            console.log(`🟠 Crunchyroll Power Up: Config saved: ${key} = ${value}`);
        });
    } catch (error) {
        console.log("🟠 Crunchyroll Power Up: Error saving config:", error);
        chromeStorage[key] = value;
    }
}

// Theater mode functionality
function enableTheaterMode() {
    console.log("🟠 Crunchyroll Power Up: Enabling theater mode");
    setTimeout(() => {
        const theaterButton = document.querySelector('[data-testid="theater-mode-button"], .theater-mode-button, [aria-label*="theater"], [aria-label*="Theater"]');
        if (theaterButton && !theaterButton.classList.contains('active')) {
            theaterButton.click();
            console.log("🟠 Crunchyroll Power Up: Theater mode button clicked");
        }
    }, 2000);
}

// Video detection and initialization
function detectVideo() {
    const video = document.querySelector('video');
    if (video && video !== videoElement) {
        videoElement = video;
        console.log("🟠 Crunchyroll Power Up: Video detected, initializing features");
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
        console.log("🟠 Crunchyroll Power Up: SkippersHandler created");
    }
    
    skippersHandler.init(videoElement);
    
    // Add next episode date if enabled
    if (chromeStorage.nextEpisodeDate) {
        addNextEpisodeDate();
    }
}

// Initialize Enhanced Mini Player
function initializeMiniPlayer() {
    if (window.crunchyPowerUpEnhancedMiniPlayer) {
        console.log("🟠 Crunchyroll Power Up: Initializing Enhanced Mini Player");
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
                console.log("🟠 Crunchyroll Power Up: Enhanced Mini Player module loaded, configuring");
                clearInterval(checkInterval);
                
                if (chromeStorage.miniPlayerEnabled !== undefined) {
                    window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(chromeStorage.miniPlayerEnabled);
                }
            } else if (attempts >= maxAttempts) {
                console.log("🟠 Crunchyroll Power Up: Enhanced Mini Player module not available after", maxAttempts, "attempts");
                clearInterval(checkInterval);
            }
        }, 500);
    }
}

// Initialize Screen Size Buttons feature
function initializeScreenSizeButtons() {
    if (window.crunchyPowerUpScreenSizeButtons) {
        console.log("🟠 Crunchyroll Power Up: Initializing Screen Size Buttons");
        window.crunchyPowerUpScreenSizeButtons.setEnabled(chromeStorage.theaterMode);
    } else {
        // Wait for Screen Size Buttons module to load
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.crunchyPowerUpScreenSizeButtons) {
                console.log("🟠 Crunchyroll Power Up: Screen Size Buttons module loaded, configuring");
                clearInterval(checkInterval);
                
                window.crunchyPowerUpScreenSizeButtons.setEnabled(chromeStorage.theaterMode);
            } else if (attempts >= maxAttempts) {
                console.log("🟠 Crunchyroll Power Up: Screen Size Buttons module not available after", maxAttempts, "attempts");
                clearInterval(checkInterval);
            }
        }, 500);
    }
}

// Listen for messages from popup and background
try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("🟠 Crunchyroll Power Up: Message received:", message);
        
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
                console.log("🟠 Crunchyroll Power Up: Config updated:", chromeStorage);
                
                // Handle Enhanced Mini Player config change
                if ('miniPlayerEnabled' in message.config && window.crunchyPowerUpEnhancedMiniPlayer) {
                    window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(message.config.miniPlayerEnabled);
                }
                
                if ('miniPlayerEnabled' in message.config && skippersHandler) {
                    if (message.config.miniPlayerEnabled) {
                        skippersHandler.showMiniPlayerButton();
                    } else {
                        skippersHandler.removeMiniPlayerButton();
                    }
                }
                break;
                
            case 'MINI_PLAYER_TOGGLE':
                console.log("🟠 Crunchyroll Power Up: Enhanced Mini Player toggle received:", message.enabled);
                chromeStorage.miniPlayerEnabled = message.enabled;
                if (window.crunchyPowerUpEnhancedMiniPlayer) {
                    window.crunchyPowerUpEnhancedMiniPlayer.setEnabled(message.enabled);
                }
                
                if (skippersHandler) {
                    if (message.enabled) {
                        skippersHandler.showMiniPlayerButton();
                    } else {
                        skippersHandler.removeMiniPlayerButton();
                    }
                }

                if (chromeStorage.nextEpisodeDate) {
                    setTimeout(() => {
                        addNextEpisodeDate();
                    }, 500);
                }
                break;
        }
    });
} catch (error) {
    console.log("🟠 Crunchyroll Power Up: Error setting up message listener:", error);
}

// Go to specific time in video
function goToTime(time, skipType = null) {
    console.log("🟠 Crunchyroll Power Up: goToTime called with time:", time, "type:", skipType);
    
    if (videoElement) {
        videoElement.currentTime = time;
        console.log("🟠 Crunchyroll Power Up: Video time set to:", time);
        
        if (skipType) {
            showNotification(null, skipType, time);
        }
    }
}

// Show notification
function showNotification(message, skipType = null, time = null) {
    console.log("🟠 Crunchyroll Power Up: showNotification called:", { message, skipType, time });
    
    let displayMessage = message;
    if (skipType && time !== null) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const typeNames = {
            'recap': 'Recap',
            'intro': 'Intro', 
            'ending': 'Ending'
        };
        
        displayMessage = `${typeNames[skipType] || 'Segment'} (${timeString})`;
    }
    
    // Remove existing notification
    const existingNotification = document.querySelector('.crunchy-plus-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'crunchy-plus-notification cp-btn';
    
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

// Add next episode date functionality
function addNextEpisodeDate() {
    console.log("🟠 Crunchyroll Power Up: Adding next episode date");
    
    // Remove existing date element
    const existingDate = document.querySelector('.next-air-date');
    if (existingDate) {
        existingDate.remove();
    }
    
    // Try to get episode air date
    if (window.getAirDate) {
        try {
            window.getAirDate().then(airDate => {
                if (airDate) {
                    displayNextEpisodeDate(airDate);
                }
            }).catch(error => {
                console.log("🟠 Crunchyroll Power Up: Error getting air date:", error);
            });
        } catch (error) {
            console.log("🟠 Crunchyroll Power Up: Error calling getAirDate:", error);
        }
    }
}

// Display next episode date
function displayNextEpisodeDate(airDate) {
    const dateElement = document.createElement('div');
    dateElement.className = 'next-air-date';
    dateElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        font-family: Arial, sans-serif;
    `;
    
    dateElement.textContent = `Next episode: ${airDate}`;
    document.body.appendChild(dateElement);
}

// Destroy next episode date
function destroyNextEpisodeDate() {
    const existingDate = document.querySelector('.next-air-date');
    if (existingDate) {
        existingDate.remove();
    }
}

// Simple SkippersHandler class
class SkippersHandler {
    constructor() {
        this.video = null;
        this.miniPlayerButton = null;
        this.skipButtons = [];
    }
    
    init(video) {
        this.video = video;
        console.log("🟠 Crunchyroll Power Up: SkippersHandler initialized");
        
        // Create mini player button if enabled
        if (chromeStorage.miniPlayerEnabled) {
            this.showMiniPlayerButton();
        }
    }
    
    showMiniPlayerButton() {
        if (this.miniPlayerButton) return;
        
        this.miniPlayerButton = document.createElement('button');
        this.miniPlayerButton.className = 'cp-btn mini-player-btn';
        this.miniPlayerButton.textContent = '📺 Mini Player';
        this.miniPlayerButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            background: #ff6b35;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        
        this.miniPlayerButton.addEventListener('click', () => {
            if (window.crunchyPowerUpEnhancedMiniPlayer) {
                window.crunchyPowerUpEnhancedMiniPlayer.toggle();
            }
        });
        
        document.body.appendChild(this.miniPlayerButton);
    }
    
    removeMiniPlayerButton() {
        if (this.miniPlayerButton) {
            this.miniPlayerButton.remove();
            this.miniPlayerButton = null;
        }
    }
    
    skipActiveIfAny() {
        // Implementation for skipping active segments
        console.log("🟠 Crunchyroll Power Up: Skip active called");
    }
    
    cleanup() {
        this.removeMiniPlayerButton();
        this.skipButtons.forEach(btn => btn.remove());
        this.skipButtons = [];
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Cleanup on page unload
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
});

console.log("🟠 Crunchyroll Power Up: Content script ready");

