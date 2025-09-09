// Screen Size Buttons for Crunchyroll Power Up
// Fixed version to prevent page freezing

let isMonitoring = false;

// Icons for each screen size (using same SVG approach as PiP)
const screenSizeIcons = {
    small: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M240-240v-480h480v480H240Zm72-72h336v-336H312v336Z"/></svg>`,
    normal: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M160-160v-640h640v640H160Zm72-72h496v-496H232v496Z"/></svg>`,
    theater: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M80-160v-640h800v640H80Zm72-72h656v-496H152v496Z"/></svg>`,
    fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>`
};

class ScreenSizeButtons {
    constructor() {
        this.isEnabled = false;
        this.currentSize = 'normal';
        this.buttonsContainer = null;
        this.observer = null;
        this.initialized = false;
        
        // Load initial state
        this.loadSettings();
    }
    
    loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.get(['theaterMode', 'preferredScreenSize'], (result) => {
                    this.isEnabled = result.theaterMode || false;
                    this.currentSize = result.preferredScreenSize || 'normal';
                    
                    console.log("🟠 Screen Size Buttons: Settings loaded", {
                        enabled: this.isEnabled,
                        currentSize: this.currentSize
                    });
                    
                    if (this.isEnabled && !this.initialized) {
                        this.init();
                    }
                });
            }
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error loading settings:", error);
        }
    }
    
    init() {
        if (this.initialized) {
            console.log("🟠 Screen Size Buttons: Already initialized");
            return;
        }
        
        console.log("🟠 Screen Size Buttons: Initializing with exact PiP technique");
        this.initialized = true;
        this.startVideoControlsMonitor();
    }
    
    startVideoControlsMonitor() {
        if (isMonitoring) {
            console.log("🟠 Screen Size Buttons: Already monitoring");
            return;
        }
        
        console.log("🟠 Screen Size Buttons: Starting video controls monitor");
        isMonitoring = true;
        
        try {
            const monitor = new MutationObserver((mutations) => {
                // Throttle the observer to prevent excessive calls
                clearTimeout(this.observerTimeout);
                this.observerTimeout = setTimeout(() => {
                    this.tryAddButtons();
                }, 100);
            });
            
            monitor.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            this.observer = monitor;
            
            // Try immediately
            setTimeout(() => {
                this.tryAddButtons();
            }, 1000);
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error starting monitor:", error);
            isMonitoring = false;
        }
    }
    
    tryAddButtons() {
        try {
            if (!this.isEnabled) {
                return;
            }
            
            // Look for video element (same as PiP)
            const video = document.querySelector('video');
            if (!video) {
                return;
            }
            
            // Look for settings control (same as PiP)
            const settingsControl = document.getElementById('settingsControl');
            if (!settingsControl) {
                return;
            }
            
            // Check if any screen size buttons already exist
            const existingButtons = document.querySelectorAll('[id*="screenSize"][id*="Control"]');
            if (existingButtons.length > 0) {
                return;
            }
            
            console.log("🟠 Screen Size Buttons: Adding buttons using exact PiP technique");
            this.addScreenSizeButtons(settingsControl, video);
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error in tryAddButtons:", error);
        }
    }
    
    addScreenSizeButtons(settingsControl, video) {
        try {
            const videoControlsContainer = settingsControl.parentElement;
            if (!videoControlsContainer) {
                console.log("🟠 Screen Size Buttons: No video controls container found");
                return;
            }
            
            console.log("🟠 Screen Size Buttons: Creating buttons container");
            
            // Create buttons using exact same technique as PiP
            const buttons = [
                { size: 'small', title: 'Pantalla pequeña' },
                { size: 'normal', title: 'Pantalla normal' },
                { size: 'theater', title: 'Modo teatro' },
                { size: 'fullscreen', title: 'Pantalla completa' }
            ];
            
            buttons.forEach(({ size, title }) => {
                const button = this.createScreenSizeControl(size, title);
                // Insert before settings control (same as PiP)
                videoControlsContainer.insertBefore(button, settingsControl);
            });
            
            console.log("🟠 Screen Size Buttons: Buttons added successfully");
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error adding buttons:", error);
        }
    }
    
    // Replicate exact createPipControl function from PiP repository
    createScreenSizeControl(size, title) {
        try {
            const parser = new DOMParser();
            const iconSvg = screenSizeIcons[size];
            const pipIconNode = parser.parseFromString(iconSvg, 'text/html');
            const pipIcon = pipIconNode.querySelector('svg');
            
            if (!pipIcon) {
                console.error("🟠 Screen Size Buttons: Failed to parse SVG for", size);
                return null;
            }
            
            // Create control exactly like PiP repository
            const pipControl = document.createElement('div');
            pipControl.setAttribute('id', `screenSize${size}Control`);
            pipControl.setAttribute('title', title);
            pipControl.classList.add('pip-control');
            pipControl.appendChild(pipIcon);
            
            pipControl.addEventListener('click', (e) => {
                e.stopImmediatePropagation();
                e.preventDefault();
                this.changeScreenSize(size);
            });
            
            return pipControl;
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error creating control:", error);
            return null;
        }
    }
    
    changeScreenSize(size) {
        try {
            console.log("🟠 Screen Size Buttons: Changing size to:", size);
            
            this.currentSize = size;
            this.savePreference(size);
            
            const video = document.querySelector('video');
            if (!video) return;
            
            const videoContainer = video.closest('[data-testid*="player"], [class*="player"], [class*="video"]') || video.parentElement;
            if (!videoContainer) return;
            
            // Remove existing size classes
            videoContainer.classList.remove('screen-size-small', 'screen-size-normal', 'screen-size-theater', 'screen-size-fullscreen');
            
            switch (size) {
                case 'small':
                    this.applySmallSize(videoContainer);
                    break;
                case 'normal':
                    this.applyNormalSize(videoContainer);
                    break;
                case 'theater':
                    this.applyTheaterSize(videoContainer);
                    break;
                case 'fullscreen':
                    this.applyFullscreenSize();
                    break;
            }
            
            videoContainer.classList.add(`screen-size-${size}`);
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error changing size:", error);
        }
    }
    
    applySmallSize(container) {
        container.style.cssText = `
            width: 640px !important;
            height: 360px !important;
            max-width: 640px !important;
            max-height: 360px !important;
            position: relative !important;
            margin: 0 auto !important;
        `;
    }
    
    applyNormalSize(container) {
        container.style.cssText = '';
        // Reset to default Crunchyroll styles
    }
    
    applyTheaterSize(container) {
        // Use existing theater mode functionality if available
        const theaterButton = document.querySelector('[data-testid="theater-mode-button"], [aria-label*="Theater"], [aria-label*="teatro"]');
        if (theaterButton && !theaterButton.classList.contains('active')) {
            theaterButton.click();
        } else {
            // Fallback: apply theater-like styles
            container.style.cssText = `
                width: 100% !important;
                max-width: 100% !important;
                height: 70vh !important;
                max-height: 70vh !important;
            `;
        }
    }
    
    applyFullscreenSize() {
        const video = document.querySelector('video');
        if (video && video.requestFullscreen) {
            video.requestFullscreen().catch(err => {
                console.log("🟠 Screen Size Buttons: Fullscreen failed:", err);
            });
        }
    }
    
    savePreference(size) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.set({ preferredScreenSize: size }, () => {
                    console.log("🟠 Screen Size Buttons: Preference saved:", size);
                });
            }
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error saving preference:", error);
        }
    }
    
    enable() {
        console.log("🟠 Screen Size Buttons: Enabling");
        this.isEnabled = true;
        if (!this.initialized) {
            this.init();
        }
    }
    
    disable() {
        console.log("🟠 Screen Size Buttons: Disabling");
        this.isEnabled = false;
        this.removeButtons();
        this.resetToNormal();
    }
    
    removeButtons() {
        try {
            // Remove all screen size buttons
            const buttons = document.querySelectorAll('[id*="screenSize"][id*="Control"]');
            buttons.forEach(button => button.remove());
            console.log("🟠 Screen Size Buttons: Buttons removed");
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error removing buttons:", error);
        }
    }
    
    resetToNormal() {
        try {
            const video = document.querySelector('video');
            if (video) {
                const videoContainer = video.closest('[data-testid*="player"], [class*="player"], [class*="video"]') || video.parentElement;
                if (videoContainer) {
                    videoContainer.style.cssText = '';
                    videoContainer.classList.remove('screen-size-small', 'screen-size-normal', 'screen-size-theater', 'screen-size-fullscreen');
                }
            }
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error resetting to normal:", error);
        }
    }
    
    destroy() {
        try {
            console.log("🟠 Screen Size Buttons: Destroying");
            this.removeButtons();
            this.resetToNormal();
            
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            
            if (this.observerTimeout) {
                clearTimeout(this.observerTimeout);
            }
            
            isMonitoring = false;
            this.initialized = false;
            
        } catch (error) {
            console.error("🟠 Screen Size Buttons: Error destroying:", error);
        }
    }
}

// Global instance
window.crunchyPowerUpScreenSizeButtons = null;

// Initialize function
function initializeScreenSizeButtons() {
    try {
        if (!window.crunchyPowerUpScreenSizeButtons) {
            window.crunchyPowerUpScreenSizeButtons = new ScreenSizeButtons();
            console.log("🟠 Screen Size Buttons: Initialized with exact PiP technique");
        }
        return window.crunchyPowerUpScreenSizeButtons;
    } catch (error) {
        console.error("🟠 Screen Size Buttons: Error initializing:", error);
        return null;
    }
}

// Auto-initialize if on video page
if (window.location.href.includes('/watch/')) {
    setTimeout(initializeScreenSizeButtons, 2000);
}

console.log("🟠 Crunchyroll Power Up: Screen Size Buttons module ready (fixed version)");

