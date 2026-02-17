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

    // In-page floating miniplayer state
    static miniActive = false;
    static miniWrapper = null;
    static miniOverlay = null;
    static miniAnimFrame = null;
    static savedPlayerParent = null;
    static savedPlayerNextSibling = null;
    static savedPlayerStyles = '';
    static playerContainer = null;

    static async handleClick() {
        debugLog("👆 Minireproductor mejorado: Botón pulsado");

        // === Toggle OFF if already active ===
        if (this.miniActive) {
            this.closeMiniPlayer();
            this.updateText(MINIPLAYER_CONFIG.buttonText);
            ToastNotifier.show("Minireproductor desactivado");
            return;
        }

        // Find current video
        const video = await VideoDetector.findVideo();
        if (!video) {
            debugLog("❌ Minireproductor mejorado: No se encontró un video al pulsar");
            ToastNotifier.show("No se encontró un video.");
            return;
        }

        if (video.paused) {
            debugLog("⏸️ Minireproductor mejorado: El video está en pausa");
            ToastNotifier.show("Reproduce el video primero.");
            return;
        }

        try {
            // Try in-page floating miniplayer first
            if (this.openInPageMini(video)) {
                this.updateText("Salir Mini");
                ToastNotifier.show("Minireproductor activado");
                return;
            }

            // Fallback to native PiP
            debugLog("📥 Minireproductor: Fallback a PiP nativo");
            if (document.pictureInPictureEnabled) {
                await video.requestPictureInPicture();
                this.updateText("Salir PiP");
                ToastNotifier.show("PiP nativo activado");
            } else {
                ToastNotifier.show("Picture-in-Picture no soportado.");
            }
        } catch (error) {
            console.error("Minireproductor mejorado: Error:", error);
            ToastNotifier.show("Error al activar minireproductor.");
        }
    }

    // =========================================================
    // IN-PAGE FLOATING MINIPLAYER
    // Repositions the player container via CSS — no DOM movement
    // across documents, works with DRM & cross-origin iframes.
    // =========================================================

    static findPlayerContainer() {
        // Strategy 1: Known Crunchyroll selectors (main frame)
        const selectors = [
            '#vilos-player',
            '[data-testid="vilos-player"]',
            '.video-player',
            '.erc-current-media-wrapper',
            '#player',
            '.player-container',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { debugLog("📦 Found player container:", sel); return el; }
        }

        // Strategy 2: Find the iframe that contains the video
        const frames = document.querySelectorAll('iframe');
        for (const frame of frames) {
            try {
                if (frame.contentDocument && frame.contentDocument.querySelector('video')) {
                    debugLog("📦 Found player via iframe parent");
                    return frame.parentElement || frame;
                }
            } catch (e) {
                // Cross-origin: check if src looks like a player
                if (frame.src && (frame.src.includes('vilos') || frame.src.includes('player') || frame.src.includes('static.crunchyroll'))) {
                    debugLog("📦 Found player iframe by src:", frame.src);
                    return frame.parentElement || frame;
                }
            }
        }

        // Strategy 3: Walk up from the video element if it's in the same document
        const vid = document.querySelector('video');
        if (vid) {
            // Go up until we find a reasonable container
            let el = vid.parentElement;
            while (el && el !== document.body) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 300 && rect.height > 200) {
                    debugLog("📦 Found player by walking up from video");
                    return el;
                }
                el = el.parentElement;
            }
        }

        return null;
    }

    static openInPageMini(video) {
        // Only from the main frame
        if (window !== window.top) return false;

        const container = this.findPlayerContainer();
        if (!container) {
            debugLog("❌ No player container found for in-page mini");
            return false;
        }

        this.playerContainer = container;
        this.savedPlayerStyles = container.getAttribute('style') || '';
        this.savedPlayerParent = container.parentNode;
        this.savedPlayerNextSibling = container.nextSibling;

        // --- Create wrapper with orange border ---
        const wrapper = document.createElement('div');
        wrapper.id = 'cpu-miniplayer-wrapper';
        wrapper.innerHTML = `
            <style>
                #cpu-miniplayer-wrapper {
                    position: fixed !important;
                    bottom: 24px !important;
                    right: 24px !important;
                    width: 420px !important;
                    height: 280px !important;
                    z-index: 2147483640 !important;
                    border: 5px solid #FF6B35 !important;
                    border-radius: 20px !important;
                    overflow: hidden !important;
                    background: #0a0a0a !important;
                    box-shadow: 0 8px 32px rgba(255, 107, 53, 0.35),
                                0 0 0 1px rgba(255, 107, 53, 0.12) !important;
                    animation: cpuMiniIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
                    display: flex !important;
                    flex-direction: column !important;
                }
                @keyframes cpuMiniIn {
                    from { opacity: 0; transform: scale(0.85) translateY(30px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                #cpu-miniplayer-wrapper .cpu-mini-player-area {
                    flex: 1; position: relative; overflow: hidden;
                    background: #000; display: flex;
                    align-items: center; justify-content: center;
                }
                #cpu-miniplayer-wrapper .cpu-mini-player-area > * {
                    width: 100% !important; height: 100% !important;
                    border: none !important; margin: 0 !important;
                    border-radius: 0 !important;
                }
                /* Controls overlay */
                #cpu-miniplayer-wrapper .cpu-mini-overlay {
                    position: absolute; inset: 0;
                    display: flex; flex-direction: column;
                    justify-content: flex-end;
                    background: linear-gradient(transparent 30%, rgba(0,0,0,0.88) 100%);
                    opacity: 0; transition: opacity 0.25s ease;
                    pointer-events: none; z-index: 10;
                }
                #cpu-miniplayer-wrapper .cpu-mini-player-area:hover .cpu-mini-overlay,
                #cpu-miniplayer-wrapper .cpu-mini-overlay.show {
                    opacity: 1; pointer-events: auto;
                }
                /* Drag bar */
                #cpu-miniplayer-wrapper .cpu-mini-drag-bar {
                    position: absolute; top: 0; left: 0; right: 0;
                    height: 28px; cursor: grab;
                    background: linear-gradient(rgba(0,0,0,0.6), transparent);
                    display: flex; align-items: center;
                    padding: 0 10px; z-index: 20;
                }
                #cpu-miniplayer-wrapper .cpu-mini-drag-bar:active { cursor: grabbing; }
                #cpu-miniplayer-wrapper .cpu-mini-drag-title {
                    font-size: 11px; color: rgba(255,255,255,0.6);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-weight: 500; white-space: nowrap;
                    overflow: hidden; text-overflow: ellipsis; flex: 1;
                }
                #cpu-miniplayer-wrapper .cpu-mini-close-btn {
                    width: 22px; height: 22px; border-radius: 50%;
                    background: rgba(255,255,255,0.12); border: none;
                    color: rgba(255,255,255,0.7); cursor: pointer;
                    font-size: 14px; display: flex; align-items: center;
                    justify-content: center; transition: all 0.15s ease;
                    flex-shrink: 0; margin-left: 6px;
                }
                #cpu-miniplayer-wrapper .cpu-mini-close-btn:hover {
                    background: #FF6B35; color: white; transform: scale(1.1);
                }
                /* Center controls */
                #cpu-miniplayer-wrapper .cpu-mini-center {
                    position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex; align-items: center; gap: 18px;
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn {
                    border: none; border-radius: 50%; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s ease; backdrop-filter: blur(4px);
                    color: #e0e0e0;
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn:hover {
                    background: rgba(255,107,53,0.3); color: #fff;
                    transform: scale(1.15);
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn.skip {
                    width: 34px; height: 34px;
                    background: rgba(255,255,255,0.1);
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn.play {
                    width: 50px; height: 50px;
                    background: linear-gradient(135deg, #FF6B35, #FF914D);
                    color: white; border: 2px solid rgba(255,255,255,0.2);
                    box-shadow: 0 4px 16px rgba(255,107,53,0.5);
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn.play:hover {
                    background: linear-gradient(135deg, #FF7F45, #FFA060);
                    box-shadow: 0 6px 24px rgba(255,107,53,0.6);
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn svg {
                    width: 18px; height: 18px; fill: currentColor;
                }
                #cpu-miniplayer-wrapper .cpu-mini-btn.play svg {
                    width: 24px; height: 24px;
                }
                /* Bottom bar */
                #cpu-miniplayer-wrapper .cpu-mini-bottom {
                    padding: 6px 12px 10px;
                }
                #cpu-miniplayer-wrapper .cpu-mini-progress {
                    width: 100%; height: 5px;
                    background: rgba(255,255,255,0.15); border-radius: 3px;
                    cursor: pointer; position: relative; transition: height 0.15s;
                }
                #cpu-miniplayer-wrapper .cpu-mini-progress:hover { height: 9px; }
                #cpu-miniplayer-wrapper .cpu-mini-progress-fill {
                    height: 100%; border-radius: 3px; position: relative;
                    background: linear-gradient(90deg, #FF6B35, #FF914D);
                    box-shadow: 0 0 8px rgba(255,107,53,0.5);
                    transition: width 0.15s linear;
                }
                #cpu-miniplayer-wrapper .cpu-mini-progress-thumb {
                    position: absolute; right: -7px; top: 50%;
                    transform: translateY(-50%) scale(0);
                    width: 14px; height: 14px; background: #FF6B35;
                    border: 2px solid white; border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    transition: transform 0.15s ease;
                }
                #cpu-miniplayer-wrapper .cpu-mini-progress:hover .cpu-mini-progress-thumb {
                    transform: translateY(-50%) scale(1);
                }
                #cpu-miniplayer-wrapper .cpu-mini-time {
                    display: flex; justify-content: space-between;
                    align-items: center; margin-top: 4px;
                    font-size: 11px; color: rgba(255,255,255,0.7);
                    font-family: -apple-system, sans-serif;
                    letter-spacing: 0.3px;
                }
                #cpu-miniplayer-wrapper .cpu-mini-dot {
                    width: 6px; height: 6px; border-radius: 50%;
                    background: #FF6B35; display: inline-block;
                    margin-right: 4px; animation: cpuPulse 1.5s ease infinite;
                }
                @keyframes cpuPulse {
                    0%,100% { opacity:1; } 50% { opacity:0.3; }
                }
                #cpu-miniplayer-wrapper .cpu-mini-dot.paused {
                    animation: none; background: #888;
                }
            </style>
        `;

        // Player area (will contain the repositioned container)
        const playerArea = document.createElement('div');
        playerArea.className = 'cpu-mini-player-area';

        // Move player container into our wrapper
        wrapper.appendChild(playerArea);
        container.parentNode.insertBefore(wrapper, container);
        playerArea.appendChild(container);

        // Remove any size constraints from the original container
        container.style.cssText = 'width:100%!important;height:100%!important;position:relative!important;';

        // -- Drag bar --
        const dragBar = document.createElement('div');
        dragBar.className = 'cpu-mini-drag-bar';
        const dragTitle = document.createElement('span');
        dragTitle.className = 'cpu-mini-drag-title';
        dragTitle.textContent = '🟠 Crunchyroll Power Up';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'cpu-mini-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => {
            this.closeMiniPlayer();
            this.updateText(MINIPLAYER_CONFIG.buttonText);
            ToastNotifier.show("Minireproductor desactivado");
        });
        dragBar.append(dragTitle, closeBtn);
        playerArea.appendChild(dragBar);

        // -- Controls overlay --
        const overlay = document.createElement('div');
        overlay.className = 'cpu-mini-overlay';
        this.miniOverlay = overlay;

        // SVG icons
        const playIcon = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        const backIcon = '<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L3.71 8.71C3.08 8.08 2 8.52 2 9.41V15c0 .55.45 1 1 1h5.59c.89 0 1.34-1.08.71-1.71l-1.91-1.91c1.39-1.16 3.16-1.88 5.12-1.88 3.16 0 5.89 1.84 7.19 4.5l1.8-.9C19.97 10.46 16.54 8 12.5 8z"/></svg>';
        const fwdIcon = '<svg viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05.99 6.9 2.6l1.89-1.89c.63-.63 1.71-.18 1.71.71V15c0 .55-.45 1-1 1h-5.59c-.89 0-1.34-1.08-.71-1.71l1.91-1.91c-1.39-1.16-3.16-1.88-5.12-1.88-3.16 0-5.89 1.84-7.19 4.5l-1.8-.9C4.03 10.46 7.46 8 11.5 8z"/></svg>';

        // Center controls
        const center = document.createElement('div');
        center.className = 'cpu-mini-center';

        const backBtn = document.createElement('button');
        backBtn.className = 'cpu-mini-btn skip';
        backBtn.innerHTML = backIcon;
        backBtn.title = '-10s';
        backBtn.addEventListener('click', () => { video.currentTime -= 10; });

        const playBtn = document.createElement('button');
        playBtn.className = 'cpu-mini-btn play';
        playBtn.innerHTML = video.paused ? playIcon : pauseIcon;
        playBtn.title = 'Play / Pause';
        playBtn.addEventListener('click', () => {
            video.paused ? video.play() : video.pause();
        });

        const fwdBtn = document.createElement('button');
        fwdBtn.className = 'cpu-mini-btn skip';
        fwdBtn.innerHTML = fwdIcon;
        fwdBtn.title = '+10s';
        fwdBtn.addEventListener('click', () => { video.currentTime += 10; });

        center.append(backBtn, playBtn, fwdBtn);

        // Bottom bar
        const bottom = document.createElement('div');
        bottom.className = 'cpu-mini-bottom';

        const progress = document.createElement('div');
        progress.className = 'cpu-mini-progress';
        const fill = document.createElement('div');
        fill.className = 'cpu-mini-progress-fill';
        const thumb = document.createElement('div');
        thumb.className = 'cpu-mini-progress-thumb';
        fill.appendChild(thumb);
        progress.appendChild(fill);

        progress.addEventListener('click', (e) => {
            const rect = progress.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (video.duration) video.currentTime = pct * video.duration;
        });

        const timeRow = document.createElement('div');
        timeRow.className = 'cpu-mini-time';
        const dot = document.createElement('span');
        dot.className = 'cpu-mini-dot';
        const tCur = document.createElement('span');
        const tDur = document.createElement('span');
        const tLeft = document.createElement('span');
        tLeft.append(dot, tCur);
        timeRow.append(tLeft, tDur);

        bottom.append(progress, timeRow);
        overlay.append(center, bottom);
        playerArea.appendChild(overlay);
        document.body.appendChild(wrapper);

        // -- Drag logic --
        let isDragging = false, dragX = 0, dragY = 0;
        dragBar.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragX = e.clientX - wrapper.getBoundingClientRect().left;
            dragY = e.clientY - wrapper.getBoundingClientRect().top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            wrapper.style.left = (e.clientX - dragX) + 'px';
            wrapper.style.top = (e.clientY - dragY) + 'px';
            wrapper.style.right = 'auto';
            wrapper.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        // -- Update loop --
        const fmt = (s) => {
            if (isNaN(s)) return '0:00';
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec < 10 ? '0' : ''}${sec}`;
        };

        const update = () => {
            if (!this.miniActive) return;
            const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
            fill.style.width = pct + '%';
            tCur.textContent = fmt(video.currentTime);
            tDur.textContent = fmt(video.duration);
            playBtn.innerHTML = video.paused ? playIcon : pauseIcon;
            dot.className = video.paused ? 'cpu-mini-dot paused' : 'cpu-mini-dot';
            this.miniAnimFrame = requestAnimationFrame(update);
        };

        this.miniWrapper = wrapper;
        this.miniActive = true;
        this.miniAnimFrame = requestAnimationFrame(update);

        // Show controls initially then auto-hide
        overlay.classList.add('show');
        setTimeout(() => overlay.classList.remove('show'), 3000);

        debugLog("✅ Minireproductor en página activado");
        return true;
    }

    static closeMiniPlayer() {
        if (!this.miniActive) return;

        cancelAnimationFrame(this.miniAnimFrame);

        // Restore the player container to its original position
        if (this.playerContainer && this.savedPlayerParent) {
            this.playerContainer.style.cssText = this.savedPlayerStyles;
            if (this.savedPlayerNextSibling) {
                this.savedPlayerParent.insertBefore(this.playerContainer, this.savedPlayerNextSibling);
            } else {
                this.savedPlayerParent.appendChild(this.playerContainer);
            }
        }

        // Remove our wrapper
        if (this.miniWrapper) {
            this.miniWrapper.remove();
            this.miniWrapper = null;
        }

        this.miniActive = false;
        this.miniOverlay = null;
        this.playerContainer = null;

        debugLog("✅ Minireproductor cerrado, reproductor restaurado");
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

        history.pushState = function () {
            originalPushState.apply(history, arguments);
            NavigationManager.handleNavigationChange();
        };

        history.replaceState = function () {
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
        ButtonManager.closeMiniPlayer();
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
        if (!document.pictureInPictureEnabled && !('documentPictureInPicture' in window)) {
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
