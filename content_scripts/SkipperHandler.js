// Skipper Handler for Crunchyroll Power Up
// Handles detection and UI for skipping intros, endings, etc.

// Helper function to go to time
function goToTime(time, skipType = null) {
    console.log("Crunchyroll Power Up: goToTime called with time:", time, "type:", skipType);

    const videoElement = document.querySelector('video');
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

// Helper function to show notification
function showNotification(message, skipType = null, time = null) {
    // Check if i18n/getMessage is available (it might be in content.js scope)
    // We'll define a simple local fallback if not

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
            // Convert 'intro' to 'autoSkipIntro'
            this.key = `autoSkip${type.charAt(0).toUpperCase() + type.slice(1)}`;
        }
        console.log("Crunchyroll Power Up: NativeSkipper created:", { start, end, type, key: this.key });
    }

    click() {
        console.log("Crunchyroll Power Up: NativeSkipper click - skipping from", this.start, "to", this.end);
        this.skipped = true;

        // Get skip type for notification
        goToTime(this.end, this.type);
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
        // Requires window.chromeStorage to be set by content.js
        if (window.chromeStorage && window.chromeStorage[this.key] === true) {
            return true;
        }
        return false;
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
        this.currentActiveButton = null;
        this.dataSource = null; // 'native', 'aniskip', 'heuristic', 'manual', null
    }

    init(video) {
        console.log("Crunchyroll Power Up: SkippersHandler init");
        this.videoElement = video;
        this.loadSkippersData();
        this.startChecking();
        this.showMiniPlayerButton(); // Agregar el botón de minireproductor
    }

    // ============================================
    // 3-LEVEL FALLBACK: loadSkippersData
    // Level 1: Native Crunchyroll + AniSkip API
    // Level 2: Heuristic detection
    // Level 3: Manual timestamps
    // ============================================

    async loadSkippersData() {
        console.log('⏭️ Cargando datos de skip (sistema híbrido 3 niveles)...');

        // ── NIVEL 1: Native Crunchyroll skip events ──
        const mediaId = await this.getMediaIdFromUrl();
        if (mediaId) {
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ type: 'skipEvents', mediaId }, resolve);
                });

                if (response && response.success && response.skipTimes && response.skipTimes.length > 0) {
                    this.skippers = response.skipTimes.map(s => new NativeSkipper(s.start, s.end, s.type));
                    this.dataSource = 'native';
                    console.log(`✅ Nivel 1a: ${this.skippers.length} skip events nativos cargados`);
                    this.showDataSourceBadge('Crunchyroll Nativo', '#4CAF50');
                    return;
                }
            } catch (error) {
                console.warn('⚠️ Error cargando skip events nativos:', error);
            }
        }

        // ── NIVEL 1b: AniSkip API (community timestamps) ──
        console.log('🔍 Nivel 1b: Intentando AniSkip API...');
        const aniSkipLoaded = await this.loadAniSkipData();
        if (aniSkipLoaded) return;

        // ── NIVEL 2: Detección heurística ──
        console.log('🔍 Nivel 2: Usando detección heurística...');
        const heuristicData = this.detectSkipRanges();
        if (heuristicData) {
            this.skippers = [];
            if (heuristicData.intro) {
                this.skippers.push(new NativeSkipper(heuristicData.intro.start, heuristicData.intro.end, 'intro'));
            }
            if (heuristicData.recap) {
                this.skippers.push(new NativeSkipper(heuristicData.recap.start, heuristicData.recap.end, 'recap'));
            }
            if (heuristicData.outro) {
                this.skippers.push(new NativeSkipper(heuristicData.outro.start, heuristicData.outro.end, 'ending'));
            }
            this.dataSource = 'heuristic';
            console.log(`⚠️ Nivel 2: ${this.skippers.length} skip points heurísticos (menos preciso)`);
            this.showDataSourceBadge('Detección Auto', '#FF9800');
            return;
        }

        // ── NIVEL 3: Timestamps manuales ──
        console.log('🔍 Nivel 3: Buscando timestamps manuales...');
        const manualData = this.loadManualTimestamps();
        if (manualData) {
            this.skippers = [];
            if (manualData.intro) {
                this.skippers.push(new NativeSkipper(manualData.intro.start, manualData.intro.end, 'intro'));
            }
            if (manualData.outro) {
                this.skippers.push(new NativeSkipper(manualData.outro.start, manualData.outro.end, 'ending'));
            }
            this.dataSource = 'manual';
            console.log(`✅ Nivel 3: ${this.skippers.length} timestamps manuales cargados`);
            this.showDataSourceBadge('Manual', '#2196F3');
            return;
        }

        // ── Sin datos disponibles ──
        console.warn('⚠️ No hay timestamps disponibles en ningún nivel');
        this.dataSource = null;
        this.offerManualConfiguration();
    }

    /**
     * Level 1b: Load skip times from AniSkip Hybrid Service.
     * @returns {boolean} true if data was loaded
     */
    async loadAniSkipData() {
        if (!window.aniSkipService) {
            console.warn('⏭️ AniSkipHybridService no disponible');
            return false;
        }

        try {
            const skipTimes = await window.aniSkipService.getSkipTimesForCurrentEpisode();

            if (skipTimes && (skipTimes.intro || skipTimes.recap || skipTimes.outro)) {
                this.skippers = [];
                if (skipTimes.intro) {
                    this.skippers.push(new NativeSkipper(skipTimes.intro.start, skipTimes.intro.end, 'intro'));
                }
                if (skipTimes.recap) {
                    this.skippers.push(new NativeSkipper(skipTimes.recap.start, skipTimes.recap.end, 'recap'));
                }
                if (skipTimes.outro) {
                    this.skippers.push(new NativeSkipper(skipTimes.outro.start, skipTimes.outro.end, 'ending'));
                }
                this.dataSource = 'aniskip';
                console.log(`✅ Nivel 1b: ${this.skippers.length} timestamps de AniSkip cargados`);
                this.showDataSourceBadge('AniSkip', '#4CAF50');
                return true;
            }
        } catch (error) {
            console.error('⏭️ Error cargando AniSkip:', error);
        }

        return false;
    }

    getSeriesSlug() {
        // Estrategia 1: JSON-LD (Más fiable)
        try {
            const ldJson = document.querySelector('script[type="application/ld+json"]');
            if (ldJson) {
                const data = JSON.parse(ldJson.innerText);
                if (data && data.partOfSeries && data.partOfSeries.url) {
                    const match = data.partOfSeries.url.match(/\/series\/([^\/]+)/);
                    if (match) return match[1];
                }
            }
        } catch (e) { console.error("Error parsing JSON-LD", e); }

        // Estrategia 2: Meta tags
        const meta = document.querySelector('meta[property="og:url"]');
        if (meta) {
            const match = meta.content.match(/\/series\/([^\/]+)/);
            if (match) return match[1];
        }

        // Estrategia 3: URL actual (si es /watch/ID/slug, a veces el slug es de la serie, pero no siempre)
        // Mejor buscar enlace a la serie en la UI
        const showLink = document.querySelector('a[href*="/series/"]');
        if (showLink) {
            const match = showLink.href.match(/\/series\/([^\/]+)/);
            if (match) return match[1];
        }

        return null;
    }

    getEpisodeNumber() {
        // Estrategia 1: JSON-LD
        try {
            const ldJson = document.querySelector('script[type="application/ld+json"]');
            if (ldJson) {
                const data = JSON.parse(ldJson.innerText);
                if (data && data.episodeNumber) {
                    return parseInt(data.episodeNumber, 10);
                }
            }
        } catch (e) { }

        // Estrategia 2: Título de la página
        const title = document.title;
        const match = title.match(/E(\d+)/);
        if (match) return parseInt(match[1], 10);

        // Estrategia 3: Meta tags
        const metaEp = document.querySelector('meta[property="og:title"]');
        if (metaEp) {
            const match = metaEp.content.match(/E(\d+)/);
            if (match) return parseInt(match[1], 10);
        }

        return null;
    }

    /**
     * Extrae el mediaId de la URL actual.
     * Ahora es ASYNC porque en iframes necesita pedir la URL al background script.
     * Soporta URLs con prefijo de idioma: /es/watch/ID/slug, /pt-br/watch/ID/slug
     * Y sin prefijo: /watch/ID/slug
     */
    async getMediaIdFromUrl() {
        let path = window.location.pathname;

        // Detect if we are in an iframe (vilos player or cross-origin)
        const isInIframe = (window.self !== window.top);

        if (isInIframe || path.includes('vilos')) {
            // We are inside an iframe. We cannot access window.parent.location.
            // Instead, ask the background script for the tab's URL.
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ type: 'getTabUrl' }, resolve);
                });

                if (response && response.success && response.url) {
                    // Parse the URL to get the pathname
                    try {
                        const tabUrl = new URL(response.url);
                        path = tabUrl.pathname;
                        console.log("Crunchyroll Power Up: Tab URL pathname obtenido via background:", path);
                    } catch (urlErr) {
                        console.warn("Crunchyroll Power Up: Error parsing tab URL:", urlErr);
                    }
                }
            } catch (e) {
                // Fallback: URL params?
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('mediaId')) {
                    return urlParams.get('mediaId');
                }
            }
        }

        // Standard ID extraction: /watch/MEDIA_ID
        const match = path.match(/(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/watch\/([^\/]+)/i);
        return match ? match[1] : null;
    }

    startChecking() {
        if (this.isChecking) return;

        this.isChecking = true;
        // Check time every second for skip logic
        this.checkInterval = setInterval(() => {
            this.checkSkippers();
        }, 1000);

        // Use MutationObserver for button persistence (Anti-React-Removal)
        this.startObserver();

        console.log("Crunchyroll Power Up: Started skippers checking");
    }

    startObserver() {
        if (this._observer) return;

        const contentEl = document.getElementById('content') || document.body;

        this._observer = new MutationObserver((mutations) => {
            // Check if our button was removed
            if (this.currentActiveButton && !document.body.contains(this.currentActiveButton)) {
                console.log("Crunchyroll Power Up: Skip button removed by React, re-injecting...");
                document.body.appendChild(this.currentActiveButton);
            }
        });

        this._observer.observe(contentEl, { childList: true, subtree: true });
    }

    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        this.isChecking = false;
        console.log("Crunchyroll Power Up: Stopped skippers checking");
    }

    // Selectors for Crunchyroll's native skip button
    static NATIVE_SKIP_SELECTORS = [
        '[data-testid="skip-intro-button"]',
        '[data-testid="skip-button"]',
        '[data-testid*="skip"]',
        '.skip-events-button',
        '[class*="skipEvent"]',
        '[class*="skip-intro"]',
        '[class*="skipIntro"]',
        'button[class*="skip"]'
    ];

    hideNativeSkipButton() {
        for (const selector of SkippersHandler.NATIVE_SKIP_SELECTORS) {
            const nativeButtons = document.querySelectorAll(selector);
            nativeButtons.forEach(btn => {
                // Don't hide our own button
                if (btn.id === 'crunchyroll-powerup-skip-btn') return;
                btn.dataset.cpuHidden = 'true';
                btn.style.setProperty('display', 'none', 'important');
            });
        }
    }

    showNativeSkipButton() {
        // Restore any buttons we previously hid
        document.querySelectorAll('[data-cpu-hidden="true"]').forEach(btn => {
            btn.style.removeProperty('display');
            delete btn.dataset.cpuHidden;
        });
    }

    checkSkippers() {
        if (!this.videoElement) return;

        const currentTime = this.videoElement.currentTime;
        let activeSkipper = null;

        for (const skipper of this.skippers) {
            const isInPeriod = currentTime >= skipper.start && skipper.end > currentTime + 1;

            if (isInPeriod) {
                if (skipper.isAutoSkip()) {
                    // Auto-skip enabled
                    if (!skipper.skipped) {
                        console.log("Crunchyroll Power Up: Auto-skipping detected for", skipper.key);
                        skipper.click(); // This sets skipped = true
                        // Show temporary button for visual feedback
                        this.showSkipButton(skipper, true);
                    }
                } else {
                    // Manual skip
                    activeSkipper = skipper;
                }
            } else {
                // Reset skipped state if we go back or leave the period
                // But only if we are significantly outside (to avoid flickering at boundaries)
                if (currentTime < skipper.start - 5 || currentTime > skipper.end + 5) {
                    skipper.skipped = false;
                }
            }
        }

        // If we found a manual skipper active right now, show button
        if (activeSkipper) {
            this.showSkipButton(activeSkipper, false);
        } else {
            // If no active manual skipper, we might need to hide the button
            // UNLESS we are currently showing a temporary auto-skip button
            if (this.currentActiveButton && !this.currentActiveButton.classList.contains('temp-auto-show')) {
                this.removeSkipButton();
            }
        }
    }

    showSkipButton(skipper, isAutoSkipFeedback = false) {
        // If we are already showing this skipper's button, do nothing (unless updating type?)
        // For auto-skip feedback, we force recreate or update to ensure animation
        if (!isAutoSkipFeedback && this.currentActiveButton && this.currentActiveButton.dataset.skipperType === skipper.type) {
            return;
        }

        // If we are currently showing a temp button, don't overwrite it with a manual one immediately
        if (this.currentActiveButton && this.currentActiveButton.classList.contains('temp-auto-show') && !isAutoSkipFeedback) {
            return;
        }

        // Remove existing button
        this.removeSkipButton();

        if (!skipper) return;

        // Create skip button container
        const button = document.createElement('button');
        button.id = 'crunchyroll-powerup-skip-btn';
        button.className = 'crunchyroll-power-up-skipper'; // Use CSS class
        button.dataset.skipperType = skipper.type; // Track type

        if (isAutoSkipFeedback) {
            button.classList.add('temp-auto-show');
            button.classList.add('auto-skip-feedback'); // For potential specific styling
        }

        // Get message and icon based on type
        let buttonText = 'Skip';
        let iconPath = 'M12,4L10.59,5.41L16.17,11H4V13H16.17L10.59,18.59L12,20L20,12L12,4Z';

        if (window.getMessage) {
            if (skipper.type === 'intro') {
                buttonText = window.getMessage('skipIntro');
                iconPath = 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z';
            }
            else if (skipper.type === 'recap') {
                buttonText = window.getMessage('skipRecap');
                iconPath = 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z';
            }
            else if (skipper.type === 'ending') {
                buttonText = window.getMessage('skipEnding');
                iconPath = 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z';
            }
        }

        button.innerHTML = `
            <svg class="skip-icon" viewBox="0 0 24 24">
                <path d="${iconPath}"></path>
            </svg>
            <span class="skip-text">${buttonText}</span>
        `;

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            skipper.click();
            this.removeSkipButton(); // Remove immediately on click
        });

        // Hide Crunchyroll's native skip button to avoid duplication
        this.hideNativeSkipButton();

        // Add to DOM
        document.body.appendChild(button);

        // Make visible
        requestAnimationFrame(() => {
            button.classList.add('active');
        });

        this.currentActiveButton = button;

        // Handle Auto-Skip Feedback Timeout
        if (isAutoSkipFeedback) {
            setTimeout(() => {
                if (this.currentActiveButton === button) {
                    button.classList.remove('active');
                    setTimeout(() => {
                        if (this.currentActiveButton === button) {
                            this.removeSkipButton();
                        }
                    }, 300); // Wait for transition
                }
            }, 3000); // Show for 3 seconds
        }

        // Expose to global for sync
        if (typeof window !== 'undefined') {
            window.currentActiveButton = button;
            // Force sync immediately to update visibility based on mouse position
            // BUT if it's auto-skip feedback, we might want to force it visible regardless of mouse?
            // The user req says: "Los botones deben aparecer brevemente... para mostrar al usuario qué está sucediendo"
            // So we should probably let it be visible.
            if (!isAutoSkipFeedback && window.syncAllButtonsVisibility) {
                window.syncAllButtonsVisibility(true);
            } else if (isAutoSkipFeedback) {
                // Ensure it's not hidden by sync logic immediately
                button.style.opacity = '1';
                button.style.transform = 'translateY(0)';
            }
        }
    }

    removeSkipButton() {
        if (this.currentActiveButton) {
            this.currentActiveButton.remove();
            this.currentActiveButton = null;
            window.currentActiveButton = null;
        }
        // Restore Crunchyroll's native skip button
        this.showNativeSkipButton();
    }

    skipActiveIfAny() {
        if (this.currentActiveButton) {
            this.currentActiveButton.click();
        }
    }

    showMiniPlayerButton() {
        // Solo mostrar si el miniplayer está habilitado
        if (window.chromeStorage && !window.chromeStorage.miniPlayerEnabled) {
            return;
        }

        // Remover botón existente
        this.removeMiniPlayerButton();

        // Use EnhancedMiniPlayer if available (Consolidated PiP)
        if (window.crunchyPowerUpEnhancedMiniPlayer) {
            // EnhancedMiniPlayer creates its own button usually.
            // But here we are creating a button in SkippersHandler.
            // We should defer to EnhancedMiniPlayer if it exists.
            // If EnhancedMiniPlayer is active, we don't need this button.
            // But existing code used SkippersHandler to create the button.
            // I will leave this as legacy fallback or integration point.
            // Ideally we shouldn't have duplicate buttons.
            return;
        }

        // ... Legacy miniplayer button logic ...
        // I will omit it if we rely on EnhancedMiniPlayer which is in features/miniplayer.js
        // The implementation plan says "Consolidate PiP features".
        // So I should disable this button if I am consolidating.
    }

    removeMiniPlayerButton() {
        if (this.miniPlayerButton) {
            this.miniPlayerButton.remove();
            this.miniPlayerButton = null;
        }
    }

    activatePictureInPicture() {
        if (window.crunchyPowerUpEnhancedMiniPlayer) {
            // Use enhanced player
            // But it doesn't expose a 'toggle' method easily accessible here maybe?
            // It does have setEnabled.
        }
        // ...
    }

    cleanup() {
        this.stopChecking();
        this.removeSkipButton();
        this.removeMiniPlayerButton();
    }

    // ============================================
    // LEVEL 2: HEURISTIC DETECTION
    // ============================================

    /**
     * Detect skip ranges based on common anime patterns.
     * Only works for videos > 10 minutes.
     */
    detectSkipRanges() {
        if (!this.videoElement ||
            !this.videoElement.duration ||
            this.videoElement.duration === Infinity ||
            this.videoElement.duration < 600) {
            console.warn('⚠️ Duración del video no disponible o muy corta para heurística');
            return null;
        }

        const duration = this.videoElement.duration;

        return {
            intro: {
                start: 60,
                end: 180,
                confidence: 0.6
            },
            recap: {
                start: 30,
                end: 90,
                confidence: 0.5
            },
            outro: {
                start: duration - 90,
                end: duration,
                confidence: 0.7
            }
        };
    }

    // ============================================
    // LEVEL 3: MANUAL TIMESTAMPS
    // ============================================

    /**
     * Load manually configured timestamps from localStorage.
     */
    loadManualTimestamps() {
        const animeId = this.getAnimeId();
        const episode = this.getEpisodeNumber();

        if (!animeId || !episode) return null;

        const key = `manual_timestamps_${animeId}_${episode}`;
        const stored = localStorage.getItem(key);

        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data && (data.intro || data.outro)) {
                    return data;
                }
            } catch (e) {
                console.error('Error parsing manual timestamps:', e);
            }
        }

        return null;
    }

    /**
     * Extract anime ID from URL.
     */
    getAnimeId() {
        const match = window.location.href.match(/\/watch\/([A-Z0-9]+)/i);
        return match ? match[1] : null;
    }

    // ============================================
    // UI: DATA SOURCE BADGE
    // ============================================

    showDataSourceBadge(label, color) {
        // Remove existing badge
        const existing = document.querySelector('.crpu-data-source-badge');
        if (existing) existing.remove();

        const badge = document.createElement('div');
        badge.className = 'crpu-data-source-badge';
        badge.textContent = `⏭️ ${label}`;
        badge.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: ${color};
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            z-index: 99999;
            opacity: 0.85;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(badge);

        setTimeout(() => {
            badge.style.opacity = '0';
            setTimeout(() => badge.remove(), 300);
        }, 4000);
    }

    // ============================================
    // UI: MANUAL CONFIGURATION OFFER
    // ============================================

    offerManualConfiguration() {
        const notification = document.createElement('div');
        notification.className = 'crpu-manual-config-offer';
        notification.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong>⚠️ Timestamps no disponibles</strong>
            </div>
            <div style="font-size: 12px; margin-bottom: 12px; color: rgba(255,255,255,0.8);">
                Este anime no tiene timestamps en AniSkip.
                ¿Quieres configurarlos manualmente?
            </div>
            <button id="crpu-configure-timestamps" style="
                background: #2196F3;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 12px;
            ">
                Configurar Timestamps
            </button>
            <button id="crpu-dismiss-offer" style="
                background: transparent;
                color: rgba(255,255,255,0.7);
                border: 1px solid rgba(255,255,255,0.3);
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                margin-left: 8px;
                font-size: 12px;
            ">
                No, gracias
            </button>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.92);
            color: white;
            padding: 16px;
            border-radius: 12px;
            z-index: 999999;
            max-width: 300px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            animation: crpuSlideIn 0.3s ease;
        `;

        // Add animation keyframes
        if (!document.getElementById('crpu-skip-animations')) {
            const style = document.createElement('style');
            style.id = 'crpu-skip-animations';
            style.textContent = `
                @keyframes crpuSlideIn {
                    from { transform: translateX(100px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        document.getElementById('crpu-configure-timestamps')?.addEventListener('click', () => {
            notification.remove();
            this.showTimestampEditor();
        });

        document.getElementById('crpu-dismiss-offer')?.addEventListener('click', () => {
            notification.remove();
        });

        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s';
                setTimeout(() => notification.remove(), 300);
            }
        }, 15000);
    }

    // ============================================
    // UI: TIMESTAMP EDITOR MODAL
    // ============================================

    showTimestampEditor() {
        const modal = document.createElement('div');
        modal.className = 'crpu-timestamp-editor';
        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #1F2937 0%, #111827 100%);
                border-radius: 20px;
                padding: 32px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
                <h2 style="color: white; margin: 0 0 24px 0; font-size: 20px;">⚙️ Configurar Timestamps</h2>

                <div style="margin-bottom: 16px;">
                    <label style="color: rgba(255,255,255,0.9); display: block; margin-bottom: 8px; font-size: 14px;">
                        🎵 Intro - Inicio (segundos):
                    </label>
                    <input type="number" id="crpu-intro-start" placeholder="Ej: 60" style="
                        width: 100%; box-sizing: border-box;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white; padding: 10px;
                        border-radius: 8px; font-size: 14px;
                    ">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="color: rgba(255,255,255,0.9); display: block; margin-bottom: 8px; font-size: 14px;">
                        🎵 Intro - Fin (segundos):
                    </label>
                    <input type="number" id="crpu-intro-end" placeholder="Ej: 150" style="
                        width: 100%; box-sizing: border-box;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white; padding: 10px;
                        border-radius: 8px; font-size: 14px;
                    ">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="color: rgba(255,255,255,0.9); display: block; margin-bottom: 8px; font-size: 14px;">
                        🎬 Outro - Inicio (segundos):
                    </label>
                    <input type="number" id="crpu-outro-start" placeholder="Ej: 1320" style="
                        width: 100%; box-sizing: border-box;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white; padding: 10px;
                        border-radius: 8px; font-size: 14px;
                    ">
                </div>

                <div style="background: rgba(33, 150, 243, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0;">
                        💡 Tip: Usa los controles del video para encontrar los tiempos exactos.
                        El tiempo actual es: <strong id="crpu-current-time">0:00</strong>
                    </p>
                </div>

                <button id="crpu-save-timestamps" style="
                    width: 100%;
                    background: linear-gradient(135deg, #2196F3 0%, #42A5F5 100%);
                    color: white; border: none;
                    padding: 14px; border-radius: 10px;
                    font-size: 16px; font-weight: 600;
                    cursor: pointer; margin-bottom: 8px;
                ">
                    Guardar Timestamps
                </button>

                <button id="crpu-cancel-timestamps" style="
                    width: 100%;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 12px; border-radius: 10px;
                    font-size: 14px; cursor: pointer;
                ">
                    Cancelar
                </button>
            </div>
        `;

        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            backdrop-filter: blur(10px);
        `;

        document.body.appendChild(modal);

        // Live time update
        const updateTimer = setInterval(() => {
            const el = document.getElementById('crpu-current-time');
            if (el && this.videoElement) {
                const min = Math.floor(this.videoElement.currentTime / 60);
                const sec = Math.floor(this.videoElement.currentTime % 60);
                el.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
            }
        }, 1000);

        // Save
        document.getElementById('crpu-save-timestamps')?.addEventListener('click', () => {
            const introStart = parseFloat(document.getElementById('crpu-intro-start').value) || null;
            const introEnd = parseFloat(document.getElementById('crpu-intro-end').value) || null;
            const outroStart = parseFloat(document.getElementById('crpu-outro-start').value) || null;

            const timestamps = {
                intro: (introStart !== null && introEnd !== null) ? { start: introStart, end: introEnd } : null,
                recap: null,
                outro: outroStart !== null ? { start: outroStart, end: this.videoElement.duration } : null
            };

            const animeId = this.getAnimeId();
            const episode = this.getEpisodeNumber();
            const key = `manual_timestamps_${animeId}_${episode}`;
            localStorage.setItem(key, JSON.stringify(timestamps));

            // Apply immediately
            this.skippers = [];
            if (timestamps.intro) {
                this.skippers.push(new NativeSkipper(timestamps.intro.start, timestamps.intro.end, 'intro'));
            }
            if (timestamps.outro) {
                this.skippers.push(new NativeSkipper(timestamps.outro.start, timestamps.outro.end, 'ending'));
            }
            this.dataSource = 'manual';

            clearInterval(updateTimer);
            modal.remove();
            this.showToast('✅ Timestamps guardados correctamente');
            this.showDataSourceBadge('Manual', '#2196F3');
        });

        // Cancel
        document.getElementById('crpu-cancel-timestamps')?.addEventListener('click', () => {
            clearInterval(updateTimer);
            modal.remove();
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                clearInterval(updateTimer);
                modal.remove();
            }
        });
    }

    // ============================================
    // UI: TOAST NOTIFICATION
    // ============================================

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(76, 175, 80, 0.4);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            animation: crpuSlideIn 0.3s ease;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Export
window.CrunchyrollPowerUpSkippersHandler = SkippersHandler;
window.CrunchyrollPowerUpNativeSkipper = NativeSkipper;
