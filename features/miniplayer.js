// Módulo de Minireproductor Mejorado (Picture-in-Picture) para Crunchyroll Power Up
// Autor: Ing. Adony R
// Permite una ventana de minireproductor persistente

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
        debugLog("🔍 Minireproductor mejorado: Iniciando búsqueda de video...");
        
        // Strategy 1: Try main document selectors
        const video = this.searchInDocument(document);
        if (video) {
            debugLog("✅ Minireproductor mejorado: Video encontrado en el documento principal");
            return video;
        }
        
        // Strategy 2: Search in same-origin iframes
        const iframeVideo = this.searchInIframes();
        if (iframeVideo) {
            debugLog("✅ Minireproductor mejorado: Video encontrado en iframe");
            return iframeVideo;
        }
        
        // Strategy 3: Search in shadow roots
        const shadowVideo = this.searchInShadowRoots(document.body);
        if (shadowVideo) {
            debugLog("✅ Minireproductor mejorado: Video encontrado en shadow DOM");
            return shadowVideo;
        }
        
    debugLog("❌ Minireproductor mejorado: No se encontró video en ningún contexto");
        return null;
    }
    
    static searchInDocument(doc) {
        for (const selector of MINIPLAYER_CONFIG.videoSelectors) {
            try {
                const videos = doc.querySelectorAll(selector);
                for (const video of videos) {
                    if (this.isValidVideo(video)) {
                        debugLog(`📺 Minireproductor mejorado: Video válido encontrado con selector: ${selector}`);
                        return video;
                    }
                }
            } catch (error) {
                // Omitir selectores inválidos silenciosamente; solo registrar en modo debug
                debugLog(`⚠️ Minireproductor mejorado: Error con el selector ${selector}:`, error);
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
                // Omitir iframes cross-origin silenciosamente
                debugLog("🔍 Minireproductor mejorado: Omitiendo iframe de distinto origen");
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
        
    debugLog("🎯 Minireproductor mejorado: Creando botón flotante");
        
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
        
    debugLog("✅ Minireproductor mejorado: Botón creado y posicionado");
        return button;
    }
    
    static remove() {
        if (miniPlayerButton) {
            debugLog("🗑️ Minireproductor mejorado: Eliminando botón");
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
    debugLog("👆 Minireproductor mejorado: Botón pulsado");
        
        // Find current video
        const video = await VideoDetector.findVideo();
        if (!video) {
            debugLog("❌ Minireproductor mejorado: No se encontró un video al pulsar");
            ToastNotifier.show("No se encontró un video.");
            return;
        }
        
        // Check if video is ready and playing
        if (video.paused) {
            debugLog("⏸️ Minireproductor mejorado: El video está en pausa");
            ToastNotifier.show("Reproduce el video primero.");
            return;
        }
        
        try {
            // Check if PiP is already active
            if (document.pictureInPictureElement) {
                debugLog("📤 Minireproductor mejorado: Saliendo de PiP");
                await document.exitPictureInPicture();
                this.updateText(MINIPLAYER_CONFIG.buttonText);
                ToastNotifier.show("Picture-in-Picture desactivado");
            } else {
                // Activate PiP
                if (!document.pictureInPictureEnabled) {
                    ToastNotifier.show("Picture-in-Picture no soportado.");
                    return;
                }
                
                debugLog("📥 Minireproductor mejorado: Activando PiP");
                await video.requestPictureInPicture();
                this.updateText("Salir PiP");
                ToastNotifier.show("Picture-in-Picture activado");
            }
        } catch (error) {
            // Mantener el registro de errores para problemas reales
            console.error("Minireproductor mejorado: Error en la operación PiP:", error);
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
    debugLog(`🔄 Minireproductor mejorado: Intento de detección de video ${currentRetryAttempt}/${MINIPLAYER_CONFIG.retryAttempts}`);
        
        const video = await VideoDetector.findVideo();
        
        if (video) {
            debugLog("✅ Minireproductor mejorado: Video detectado, mostrando botón");
            currentVideo = video;
            
            // Set up video event listeners
            this.setupVideoEventListeners(video);
            
            // Show button
            ButtonManager.create();
            return true;
        }
        
        if (currentRetryAttempt < MINIPLAYER_CONFIG.retryAttempts) {
            const delay = MINIPLAYER_CONFIG.retryDelay * Math.pow(MINIPLAYER_CONFIG.backoffMultiplier, currentRetryAttempt - 1);
            debugLog(`⏳ Minireproductor mejorado: Reintentando en ${delay}ms...`);
            
            retryTimeout = setTimeout(() => {
                this.attemptVideoDetection();
            }, delay);
        } else {
            debugLog("❌ Minireproductor mejorado: Se agotaron los intentos de reintento");
            this.cleanup();
        }
        
        return false;
    }
    
    static setupVideoEventListeners(video) {
        // Listen for PiP events to update button text
        video.addEventListener('enterpictureinpicture', () => {
            debugLog("📥 Minireproductor mejorado: Entró en modo PiP");
            ButtonManager.updateText("Salir PiP");
        });
        
        video.addEventListener('leavepictureinpicture', () => {
            debugLog("📤 Minireproductor mejorado: Salió del modo PiP");
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
        
    debugLog("🧭 Minireproductor mejorado: Observador de URL activo");
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
                debugLog("🔍 Minireproductor mejorado: Cambio en el DOM detectado, re-evaluando...");
                setTimeout(() => {
                    NavigationManager.handlePageUpdate();
                }, 500); // Small delay to allow DOM to stabilize
            }
        });
        
        domObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
    debugLog("👁️ Minireproductor mejorado: Observador del DOM activo");
    }
    
    static handleNavigationChange() {
        if (PageDetector.hasUrlChanged()) {
            debugLog("🧭 Minireproductor mejorado: Cambio de URL detectado:", window.location.href);
            setTimeout(() => {
                this.handlePageUpdate();
            }, 1000); // Give page time to load
        }
    }
    
    static handleInitialPageLoad() {
    debugLog("🏁 Minireproductor mejorado: Procesando carga inicial de la página");
        setTimeout(() => {
            this.handlePageUpdate();
        }, 1500); // Wait for initial page content to load
    }
    
    static handlePageUpdate() {
        const isEpisodePage = PageDetector.isEpisodePage();
    debugLog(`📄 Minireproductor mejorado: Actualización de página - Página de episodio: ${isEpisodePage}`);
        
        if (isEpisodePage) {
            // We're on an episode page, start video detection
            RetryManager.startVideoDetectionRetry();
        } else {
            // Not on episode page, clean up
            this.cleanup();
        }
    }
    
    static cleanup() {
    debugLog("🧹 Minireproductor mejorado: Limpiando para páginas que no son de episodio");
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
    debugLog("💀 Minireproductor mejorado: Módulo destruido");
    }
}

// Main module interface
const EnhancedMiniPlayer = {
    init() {
    debugLog("🚀 Minireproductor mejorado: Inicializando módulo");
        
        // Check if we're on a supported browser
        if (!document.pictureInPictureEnabled) {
            debugLog("⚠️ Minireproductor mejorado: Picture-in-Picture no soportado");
            return;
        }
        
        NavigationManager.init();
    debugLog("✅ Minireproductor mejorado: Módulo inicializado correctamente");
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

debugLog("✅ Minireproductor mejorado: Módulo cargado correctamente");
