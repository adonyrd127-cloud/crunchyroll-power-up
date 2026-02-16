// Botones de tamaño de pantalla para Crunchyroll Power Up
// Injected into native Crunchyroll control bar (same approach as pipControl.js)

(() => {
    let screenModeMonitoring = false;
    let screenModeMonitor = null;
    let currentScreenSize = 'normal';

    // SVG icons matching Crunchyroll's native icon style (20px, #e8eaed fill)
    const screenSizeIcons = {
        small: '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M280-280v-400h400v400H280Zm80-80h240v-240H360v240Z"/></svg>',
        normal: '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M160-160v-640h640v640H160Zm80-80h480v-480H240v480Z"/></svg>',
        theater: '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M80-280v-400h800v400H80Zm80-80h640v-240H160v240Z"/></svg>'
    };

    const screenSizeLabels = {
        small: 'Pantalla pequeña',
        normal: 'Pantalla normal',
        theater: 'Modo teatro'
    };

    // Load saved preference
    try {
        chrome.storage.sync.get({ preferredScreenSize: 'normal' }, (result) => {
            currentScreenSize = result.preferredScreenSize || 'normal';
        });
    } catch (e) { }

    function createScreenSizeControl(size, title) {
        const parser = new DOMParser();
        const iconNode = parser.parseFromString(screenSizeIcons[size], 'text/html');
        const iconSvg = iconNode.querySelector('svg');
        if (!iconSvg) return null;

        const control = document.createElement('div');
        control.setAttribute('id', `screenSize-${size}-Control`);
        control.setAttribute('title', title);
        control.classList.add('pip-control'); // Same class as PiP button for consistent styling
        control.classList.add('cpu-screen-mode-control');
        control.appendChild(iconSvg);

        // Highlight active mode
        if (size === currentScreenSize) {
            control.classList.add('cpu-screen-mode-active');
        }

        control.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            changeScreenSize(size);
        });

        return control;
    }

    function addScreenSizeControls(settingsControl, video) {
        if (!settingsControl || !video) return;
        const container = settingsControl.parentElement;
        if (!container) return;

        const sizes = ['small', 'normal', 'theater'];

        // Insert all buttons before the settings control, in order
        // They'll appear: [small][normal][theater][fullscreen] [pip] [settings] [fullscreen-native]
        sizes.forEach(size => {
            const control = createScreenSizeControl(size, screenSizeLabels[size]);
            if (control) {
                // Insert before the PiP control if it exists, otherwise before settings
                const pipControl = document.getElementById('pipControl');
                const refNode = pipControl || settingsControl;
                container.insertBefore(control, refNode);
            }
        });

        console.log("🟠 Screen Size Buttons: Injected into native control bar");
    }

    function changeScreenSize(size) {
        console.log("🟠 Screen Size Buttons: Changing to:", size);
        currentScreenSize = size;
        savePreference(size);
        updateActiveStates();

        const video = document.querySelector('video') || document.getElementById('player0');
        if (!video) return;

        const videoContainer = video.closest('[data-testid*="player"], [class*="player"], [class*="video"]') || video.parentElement;

        if (videoContainer) {
            videoContainer.classList.remove('screen-size-small', 'screen-size-normal', 'screen-size-theater', 'screen-size-fullscreen');
        }

        switch (size) {
            case 'small':
                if (videoContainer) {
                    videoContainer.style.cssText = `
                        width: 640px !important;
                        height: 360px !important;
                        max-width: 640px !important;
                        max-height: 360px !important;
                        position: relative !important;
                        margin: 0 auto !important;
                    `;
                }
                break;
            case 'normal':
                if (videoContainer) videoContainer.style.cssText = '';
                break;
            case 'theater':
                const theaterBtn = document.querySelector('[data-testid="theater-mode-button"], [aria-label*="Theater"], [aria-label*="teatro"]');
                if (theaterBtn) {
                    theaterBtn.click();
                } else if (videoContainer) {
                    videoContainer.style.cssText = `
                        width: 100% !important;
                        max-width: 100% !important;
                        height: 70vh !important;
                        max-height: 70vh !important;
                    `;
                }
                break;
        }

        if (videoContainer) {
            videoContainer.classList.add(`screen-size-${size}`);
        }
    }

    function updateActiveStates() {
        document.querySelectorAll('.cpu-screen-mode-control').forEach(ctrl => {
            const size = ctrl.id.replace('screenSize-', '').replace('-Control', '');
            ctrl.classList.toggle('cpu-screen-mode-active', size === currentScreenSize);
        });
    }

    function savePreference(size) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.set({ preferredScreenSize: size });
            }
        } catch (e) { }
    }

    function removeScreenSizeControls() {
        document.querySelectorAll('.cpu-screen-mode-control').forEach(el => el.remove());
    }

    function resetVideoSize() {
        const video = document.querySelector('video') || document.getElementById('player0');
        if (video) {
            const container = video.closest('[data-testid*="player"], [class*="player"], [class*="video"]') || video.parentElement;
            if (container) {
                container.style.cssText = '';
                container.classList.remove('screen-size-small', 'screen-size-normal', 'screen-size-theater', 'screen-size-fullscreen');
            }
        }
    }

    // MutationObserver — same pattern as pipControl.js
    function startScreenModeMonitor() {
        if (screenModeMonitoring) return;

        screenModeMonitor = new MutationObserver(() => {
            const video = document.getElementById('player0') || document.querySelector('video');
            if (!video) return;
            const settingsControl = document.getElementById('settingsControl');
            if (!settingsControl) return;
            // Already injected?
            const existing = document.querySelector('.cpu-screen-mode-control');
            if (existing) return;
            addScreenSizeControls(settingsControl, video);
        });

        screenModeMonitor.observe(document.body, { childList: true, subtree: true });
        screenModeMonitoring = true;
    }

    function stopScreenModeMonitor() {
        if (screenModeMonitor) {
            screenModeMonitor.disconnect();
            screenModeMonitor = null;
        }
        screenModeMonitoring = false;
    }

    function screenModeInit() {
        if (screenModeMonitoring) return;
        startScreenModeMonitor();
    }

    function screenModeDestroy() {
        removeScreenSizeControls();
        resetVideoSize();
        stopScreenModeMonitor();
    }

    // --- Public API exposed on window ---
    window.crunchyPowerUpScreenSizeButtons = {
        setEnabled(enabled) {
            if (enabled) {
                screenModeInit();
            } else {
                screenModeDestroy();
            }
        },
        enable() { this.setEnabled(true); },
        disable() { this.setEnabled(false); },
        destroy() { screenModeDestroy(); },
        get buttonsContainer() {
            // Return first control for sync compatibility
            return document.querySelector('.cpu-screen-mode-control');
        }
    };

    // Initialize based on stored setting
    chrome.storage.sync.get({ theaterMode: false }, (result) => {
        try {
            if (result.theaterMode) {
                screenModeInit();
            }
        } catch (err) {
            console.error('🟠 Screen Size Buttons init error:', err);
        }
    });

    // Listen for toggle from popup
    chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === 'THEATER_MODE_TOGGLE') {
            if (message.enabled) {
                screenModeInit();
            } else {
                screenModeDestroy();
            }
        }
    });

    console.log("🟠 Crunchyroll Power Up: Screen Size Buttons module ready (native control bar injection)");
})();
