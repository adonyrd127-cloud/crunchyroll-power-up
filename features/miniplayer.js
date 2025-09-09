// Enhanced Mini Player (Picture-in-Picture) Module for Crunchyroll Power Up
// Author: MiniMax Agent
// Based on picture-in-picture-extension-for-crunchyroll with complete UI redesign

// Debug configuration - set to false for production
const DEBUG = false;

// Configuration
const MINIPLAYER_CONFIG = {
    buttonId: 'cp-miniplayer-btn',
    buttonText: 'Minireproductor',
    retryAttempts: 5,
    retryDelay: 1000, // 1 second between attempts
    backoffMultiplier: 1.2,
    toastDuration: 3000,
    zIndex: 2147483640, // Below Crunchyroll dialogs
    
    // Enhanced video selectors based on reference implementation and testing
    videoSelectors: [
        '#player0', // Primary Crunchyroll video ID (from reference)
        'video[id="player0"]',
        'video',
        'video[src]',
        'video[data-testid]',
        '.video-player video',
        '[data-testid="vilos-player"] video',
        '.player-container video',
        '.video-container video'
    ]
};

// Debug logging helper
const debugLog = (...args) => {
    if (DEBUG) {
        console.log(...args);
    }
};

// Global state
let miniPlayerButton = null;
let currentVideo = null;
let isEnabled = true;
let retryTimeout = null;
let currentRetryAttempt = 0;
let domObserver = null;
let urlObserver = null;
let lastUrl = window.location.href;

// Enhanced video detection with multiple strategies and retry logic
class VideoDetector {
    static async findVideo() {
        debugLog("🔍 Enhanced Mini Player: Starting video search...");
        
        // Strategy 1: Try main document selectors
        const video = this.searchInDocument(document);
        if (video) {
            debugLog("✅ Enhanced Mini Player: Video found in main document");
            return video;
        }
        
        // Strategy 2: Search in same-origin iframes
        const iframeVideo = this.searchInIframes();
        if (iframeVideo) {
            debugLog("✅ Enhanced Mini Player: Video found in iframe");
            return iframeVideo;
        }
        
        // Strategy 3: Search in shadow roots
        const shadowVideo = this.searchInShadowRoots(document.body);
        if (shadowVideo) {
            debugLog("✅ Enhanced Mini Player: Video found in shadow DOM");
            return shadowVideo;
        }
        
        debugLog("❌ Enhanced Mini Player: No video found in any context");
        return null;
    }
    
    static searchInDocument(doc) {
        for (const selector of MINIPLAYER_CONFIG.videoSelectors) {
            try {
                const videos = doc.querySelectorAll(selector);
                for (const video of videos) {
                    if (this.isValidVideo(video)) {
                        debugLog(`📺 Enhanced Mini Player: Valid video found with selector: ${selector}`);
                        return video;
                    }
                }
            } catch (error) {
                // Silently skip invalid selectors, only log in debug mode
                debugLog(`⚠️ Enhanced Mini Player: Error with selector ${selector}:`, error);
            }
        }
        return null;
    }
    
    static searchInIframes() {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                // Only check same-origin iframes to avoid cross-origin errors
                if (this.isSameOrigin(iframe)) {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        const video = this.searchInDocument(iframeDoc);
                        if (video) return video;
                    }
                }
            } catch (error) {
                // Silently skip cross-origin iframes
                debugLog("🔍 Enhanced Mini Player: Skipping cross-origin iframe");
            }
        }
        return null;
    }
    
    static searchInShadowRoots(element) {
        if (element.shadowRoot) {
            const video = this.searchInDocument(element.shadowRoot);
            if (video) return video;
        }
        
        // Recursively search child elements with shadow roots
        for (const child of element.children || []) {
            const video = this.searchInShadowRoots(child);
            if (video) return video;
        }
        
        return null;
    }
    
    static isValidVideo(video) {
        return video && 
               video.tagName === 'VIDEO' && 
               (video.src || video.currentSrc || video.srcObject) &&
               video.readyState >= 1; // HAVE_METADATA or higher
    }
    
    static isSameOrigin(iframe) {
        try {
            return iframe.contentWindow.location.hostname === window.location.hostname;
        } catch {
            return false;
        }
    }
}

// URL and page detection utilities
class PageDetector {
    static isEpisodePage() {
        const url = window.location.href;
        const pathname = window.location.pathname;
        
        // Match /watch/ patterns (e.g., https://www.crunchyroll.com/*/watch/*)
        return pathname.includes('/watch/') || url.includes('/watch/');
    }
    
    static hasUrlChanged() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            return true;
        }
        return false;
    }
}

// Toast notification system
class ToastNotifier {
    static show(message) {
        // Remove existing toast
        this.remove();
        
        const toast = document.createElement('div');
        toast.id = 'cp-miniplayer-toast';
        toast.className = 'cp-toast';
        toast.textContent = message;
        
        // Position near the button area
        toast.style.cssText = `
            position: fixed;
            bottom: 140px;
            right: 24px;
            background: linear-gradient(135deg, #ff6b35, #ff914d);
            color: white;
            padding: 12px 16px;
            border-radius: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: ${MINIPLAYER_CONFIG.zIndex + 1};
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 200px;
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);
        
        // Auto-remove
        setTimeout(() => {
            this.remove();
        }, MINIPLAYER_CONFIG.toastDuration);
    }
    
    static remove() {
        const existingToast = document.getElementById('cp-miniplayer-toast');
        if (existingToast) {
            existingToast.style.opacity = '0';
            existingToast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (existingToast.parentNode) {
                    existingToast.remove();
                }
            }, 300);
        }
    }
}

// Button management
class ButtonManager {
    static create() {
        if (miniPlayerButton) {
            return miniPlayerButton;
        }
        
        debugLog("🎯 Enhanced Mini Player: Creating floating button");
        
        const button = document.createElement('button');
        button.id = MINIPLAYER_CONFIG.buttonId;
        button.className = 'cp-miniplayer-btn';
        button.textContent = MINIPLAYER_CONFIG.buttonText;
        button.setAttribute('aria-label', 'Activar Picture-in-Picture');
        button.setAttribute('title', 'Activar Picture-in-Picture');
        
        // Exact styling per user specifications
        button.style.cssText = `
            position: fixed;
            bottom: 110px;
            right: 24px;
            background: linear-gradient(135deg, #ff6b35, #ff914d);
            color: white;
            border: none;
            border-radius: 24px;
            padding: 12px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
            z-index: ${MINIPLAYER_CONFIG.zIndex};
            transition: all 0.2s ease;
            user-select: none;
            outline: none;
            min-width: 140px;
            text-align: center;
            opacity: 0;
            transform: translateY(20px) scale(0.9);
        `;
        
        // Hover and focus effects
        const addHoverEffects = () => {
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-2px) scale(1.02)';
                button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0) scale(1)';
                button.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
            });
            
            button.addEventListener('focus', () => {
                button.style.outline = '2px solid #ff914d';
                button.style.outlineOffset = '2px';
            });
            
            button.addEventListener('blur', () => {
                button.style.outline = 'none';
            });
        };
        
        addHoverEffects();
        
        // Click handler
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleClick();
        });
        
        document.body.appendChild(button);
        miniPlayerButton = button;
        
        // Animate in
        setTimeout(() => {
            button.style.opacity = '1';
            button.style.transform = 'translateY(0) scale(1)';
        }, 100);
        
        debugLog("✅ Enhanced Mini Player: Button created and positioned");
        return button;
    }
    
    static remove() {
        if (miniPlayerButton) {
            debugLog("🗑️ Enhanced Mini Player: Removing button");
            miniPlayerButton.style.opacity = '0';
            miniPlayerButton.style.transform = 'translateY(20px) scale(0.9)';
            
            setTimeout(() => {
                if (miniPlayerButton && miniPlayerButton.parentNode) {
                    miniPlayerButton.remove();
                }
                miniPlayerButton = null;
            }, 200);
        }
    }
    
    static updateText(text) {
        if (miniPlayerButton) {
            miniPlayerButton.textContent = text;
        }
    }
    
    static async handleClick() {
        debugLog("👆 Enhanced Mini Player: Button clicked");
        
        // Find current video
        const video = await VideoDetector.findVideo();
        if (!video) {
            debugLog("❌ Enhanced Mini Player: No video found on click");
            ToastNotifier.show("No se encontró un video.");
            return;
        }
        
        // Check if video is ready and playing
        if (video.paused) {
            debugLog("⏸️ Enhanced Mini Player: Video is paused");
            ToastNotifier.show("Reproduce el video primero.");
            return;
        }
        
        try {
            // Check if PiP is already active
            if (document.pictureInPictureElement) {
                debugLog("📤 Enhanced Mini Player: Exiting PiP");
                await document.exitPictureInPicture();
                this.updateText(MINIPLAYER_CONFIG.buttonText);
                ToastNotifier.show("Picture-in-Picture desactivado");
            } else {
                // Activate PiP
                if (!document.pictureInPictureEnabled) {
                    ToastNotifier.show("Picture-in-Picture no soportado.");
                    return;
                }
                
                debugLog("📥 Enhanced Mini Player: Activating PiP");
                await video.requestPictureInPicture();
                this.updateText("Salir PiP");
                ToastNotifier.show("Picture-in-Picture activado");
            }
        } catch (error) {
            // Keep error logging for genuine issues
            console.error("Enhanced Mini Player: PiP operation failed:", error);
            ToastNotifier.show("Error al activar Picture-in-Picture.");
        }
    }
}

// Retry mechanism for video detection
class RetryManager {
    static async startVideoDetectionRetry() {
        if (retryTimeout) {
            clearTimeout(retryTimeout);
        }
        
        currentRetryAttempt = 0;
        return this.attemptVideoDetection();
    }
    
    static async attemptVideoDetection() {
        currentRetryAttempt++;
        debugLog(`🔄 Enhanced Mini Player: Video detection attempt ${currentRetryAttempt}/${MINIPLAYER_CONFIG.retryAttempts}`);
        
        const video = await VideoDetector.findVideo();
        
        if (video) {
            debugLog("✅ Enhanced Mini Player: Video detected, showing button");
            currentVideo = video;
            
            // Set up video event listeners
            this.setupVideoEventListeners(video);
            
            // Show button
            ButtonManager.create();
            return true;
        }
        
        if (currentRetryAttempt < MINIPLAYER_CONFIG.retryAttempts) {
            const delay = MINIPLAYER_CONFIG.retryDelay * Math.pow(MINIPLAYER_CONFIG.backoffMultiplier, currentRetryAttempt - 1);
            debugLog(`⏳ Enhanced Mini Player: Retrying in ${delay}ms...`);
            
            retryTimeout = setTimeout(() => {
                this.attemptVideoDetection();
            }, delay);
        } else {
            debugLog("❌ Enhanced Mini Player: All retry attempts exhausted");
            this.cleanup();
        }
        
        return false;
    }
    
    static setupVideoEventListeners(video) {
        // Listen for PiP events to update button text
        video.addEventListener('enterpictureinpicture', () => {
            debugLog("📥 Enhanced Mini Player: Entered PiP mode");
            ButtonManager.updateText("Salir PiP");
        });
        
        video.addEventListener('leavepictureinpicture', () => {
            debugLog("📤 Enhanced Mini Player: Left PiP mode");
            ButtonManager.updateText(MINIPLAYER_CONFIG.buttonText);
        });
    }
    
    static cleanup() {
        if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
        }
        currentRetryAttempt = 0;
        currentVideo = null;
    }
}

// Navigation and DOM monitoring
class NavigationManager {
    static init() {
        this.setupUrlObserver();
        this.setupDomObserver();
        this.handleInitialPageLoad();
    }
    
    static setupUrlObserver() {
        // Hook into history API for SPA navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            NavigationManager.handleNavigationChange();
        };
        
        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            NavigationManager.handleNavigationChange();
        };
        
        // Listen for popstate (back/forward buttons)
        window.addEventListener('popstate', () => {
            NavigationManager.handleNavigationChange();
        });
        
        debugLog("🧭 Enhanced Mini Player: URL observer active");
    }
    
    static setupDomObserver() {
        if (domObserver) {
            domObserver.disconnect();
        }
        
        domObserver = new MutationObserver((mutations) => {
            let shouldRecheck = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element node
                            if (node.tagName === 'VIDEO' || 
                                node.querySelector && node.querySelector('video') ||
                                node.id === 'player0') {
                                shouldRecheck = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldRecheck) break;
            }
            
            if (shouldRecheck) {
                debugLog("🔍 Enhanced Mini Player: DOM change detected, rechecking...");
                setTimeout(() => {
                    NavigationManager.handlePageUpdate();
                }, 500); // Small delay to allow DOM to stabilize
            }
        });
        
        domObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        debugLog("👁️ Enhanced Mini Player: DOM observer active");
    }
    
    static handleNavigationChange() {
        if (PageDetector.hasUrlChanged()) {
            debugLog("🧭 Enhanced Mini Player: URL change detected:", window.location.href);
            setTimeout(() => {
                this.handlePageUpdate();
            }, 1000); // Give page time to load
        }
    }
    
    static handleInitialPageLoad() {
        debugLog("🏁 Enhanced Mini Player: Handling initial page load");
        setTimeout(() => {
            this.handlePageUpdate();
        }, 1500); // Wait for initial page content to load
    }
    
    static handlePageUpdate() {
        const isEpisodePage = PageDetector.isEpisodePage();
        debugLog(`📄 Enhanced Mini Player: Page update - Episode page: ${isEpisodePage}`);
        
        if (isEpisodePage) {
            // We're on an episode page, start video detection
            RetryManager.startVideoDetectionRetry();
        } else {
            // Not on episode page, clean up
            this.cleanup();
        }
    }
    
    static cleanup() {
        debugLog("🧹 Enhanced Mini Player: Cleaning up for non-episode page");
        ButtonManager.remove();
        RetryManager.cleanup();
        ToastNotifier.remove();
        currentVideo = null;
    }
    
    static destroy() {
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }
        
        if (urlObserver) {
            urlObserver.disconnect();
            urlObserver = null;
        }
        
        this.cleanup();
        debugLog("💀 Enhanced Mini Player: Module destroyed");
    }
}

// Main module interface
const EnhancedMiniPlayer = {
    init() {
        debugLog("🚀 Enhanced Mini Player: Initializing module");
        
        // Check if we're on a supported browser
        if (!document.pictureInPictureEnabled) {
            debugLog("⚠️ Enhanced Mini Player: Picture-in-Picture not supported");
            return;
        }
        
        NavigationManager.init();
        debugLog("✅ Enhanced Mini Player: Module initialized successfully");
    },
    
    destroy() {
        NavigationManager.destroy();
    },
    
    isEnabled() {
        return isEnabled;
    },
    
    setEnabled(enabled) {
        isEnabled = enabled;
        if (!enabled) {
            NavigationManager.cleanup();
        } else if (PageDetector.isEpisodePage()) {
            RetryManager.startVideoDetectionRetry();
        }
    }
};

// Auto-initialize if script is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        EnhancedMiniPlayer.init();
    });
} else {
    // DOM is already ready
    setTimeout(() => {
        EnhancedMiniPlayer.init();
    }, 100);
}

// Export for external access
window.crunchyPowerUpEnhancedMiniPlayer = EnhancedMiniPlayer;

debugLog("✅ Enhanced Mini Player: Module loaded successfully");
