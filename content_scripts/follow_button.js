/**
 * CONTENT SCRIPT: BOTÓN DE SEGUIMIENTO DE ANIMES
 * Inyecta un botón en páginas de anime para permitir seguimiento
 * y notificaciones de nuevos episodios.
 */

(function () {
    'use strict';

    // Avoid running in iframes
    if (window !== window.top) return;

    // ============================================
    // CSS STYLES
    // ============================================

    const FOLLOW_STYLES = `
        /* Follow Button */
        .powerup-follow-button {
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.08);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 10px;
            color: white;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-family: inherit;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
            margin: 8px;
            z-index: 100;
        }

        .powerup-follow-button:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }

        .powerup-follow-button.active {
            background: linear-gradient(135deg, #FF6B35 0%, #FF8C5A 100%);
            border-color: #FF6B35;
            box-shadow: 0 4px 20px rgba(255, 107, 53, 0.5);
        }

        .powerup-follow-button.active:hover {
            background: linear-gradient(135deg, #FF8C5A 0%, #FFA574 100%);
            box-shadow: 0 6px 24px rgba(255, 107, 53, 0.6);
        }

        .powerup-follow-button .bell-icon {
            font-size: 20px;
            display: inline-block;
            transition: transform 0.3s ease;
        }

        .powerup-follow-button:hover .bell-icon {
            transform: rotate(15deg) scale(1.1);
        }

        .powerup-follow-button.active .bell-icon {
            animation: cpuBellRing 0.5s ease;
        }

        @keyframes cpuBellRing {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(15deg); }
            75% { transform: rotate(-15deg); }
        }

        /* Toast Notification */
        .powerup-follow-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: linear-gradient(135deg, #FF6B35 0%, #FF8C5A 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(255, 107, 53, 0.4);
            font-weight: 600;
            font-size: 14px;
            z-index: 2147483647;
            animation: cpuSlideInRight 0.3s ease, cpuFadeOutRight 0.3s ease 2.7s forwards;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none;
        }

        @keyframes cpuSlideInRight {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0); opacity: 1; }
        }

        @keyframes cpuFadeOutRight {
            to { opacity: 0; transform: translateX(400px); }
        }
    `;

    // ============================================
    // FOLLOW BUTTON MANAGER
    // ============================================

    class FollowButtonManager {
        constructor() {
            this.button = null;
            this.currentAnimeData = null;
            this.isFollowing = false;
            this.injected = false;
            this.lastUrl = location.href;
        }

        init() {
            console.log('🔔 CPU Follow: Inicializando sistema de seguimiento...');

            // Inject global styles once
            this.injectStyles();

            // Try to inject on current page
            if (this.isSeriesPage()) {
                this.scheduleInjection();
            }

            // Watch for SPA navigation via URL changes
            this.observeNavigation();
        }

        injectStyles() {
            if (document.getElementById('cpu-follow-styles')) return;
            const style = document.createElement('style');
            style.id = 'cpu-follow-styles';
            style.textContent = FOLLOW_STYLES;
            document.head.appendChild(style);
        }

        isSeriesPage() {
            return /\/series\/[A-Z0-9]+/i.test(window.location.pathname);
        }

        observeNavigation() {
            // Crunchyroll is an SPA — detect URL changes via MutationObserver
            new MutationObserver(() => {
                const url = location.href;
                if (url !== this.lastUrl) {
                    this.lastUrl = url;
                    this.onNavigate();
                }
            }).observe(document.body, { childList: true, subtree: true });
        }

        onNavigate() {
            // Remove old button on navigation
            this.cleanup();

            if (this.isSeriesPage()) {
                console.log('🔔 CPU Follow: Navegación a página de serie detectada');
                this.scheduleInjection();
            }
        }

        cleanup() {
            const existing = document.getElementById('powerup-follow-btn');
            if (existing) existing.remove();
            this.button = null;
            this.injected = false;
        }

        scheduleInjection() {
            // Wait for the page to render the hero section
            let attempts = 0;
            const maxAttempts = 25;

            const check = setInterval(async () => {
                attempts++;
                if (attempts > maxAttempts) {
                    clearInterval(check);
                    console.warn('🔔 CPU Follow: No se encontró contenedor tras', maxAttempts, 'intentos');
                    return;
                }

                // Don't inject twice
                if (document.getElementById('powerup-follow-btn')) {
                    clearInterval(check);
                    return;
                }

                const container = this.findContainer();
                if (container) {
                    clearInterval(check);
                    await this.createButton(container);
                }
            }, 500);
        }

        findContainer() {
            // Crunchyroll series page selectors — try multiple strategies
            const selectors = [
                // Hero / header area
                '[class*="hero-heading"]',
                '[class*="series-header"]',
                '[class*="show-header"]',
                '[class*="erc-series-hero"]',
                // Action buttons area
                '[class*="action-buttons"]',
                '[class*="series-actions"]',
                '[class*="hero"] [class*="actions"]',
                '[class*="hero"] [class*="buttons"]',
                // Broader fallback
                'h1[class*="title"]',
            ];

            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el;
            }

            // Last resort: find the first h1 and use its parent
            const h1 = document.querySelector('h1');
            if (h1 && h1.closest('[class*="hero"], [class*="header"], [class*="series"]')) {
                return h1.parentElement;
            }

            return null;
        }

        async createButton(container) {
            try {
                // Extract anime data from the page
                this.currentAnimeData = this.extractAnimeData();

                if (!this.currentAnimeData.id) {
                    console.error('🔔 CPU Follow: No se pudo extraer ID del anime');
                    return;
                }

                // Check if already following
                const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');
                this.isFollowing = followedAnimes.some(a => a.id === this.currentAnimeData.id);

                // Create button element
                this.button = document.createElement('button');
                this.button.id = 'powerup-follow-btn';
                this.button.className = 'powerup-follow-button';
                if (this.isFollowing) this.button.classList.add('active');
                this.updateButtonContent();

                // Click handler
                this.button.addEventListener('click', () => this.toggleFollow());

                // Insert: prefer action/button area, fallback to appending
                const actionsArea = container.querySelector('[class*="actions"], [class*="buttons"]');
                if (actionsArea) {
                    actionsArea.appendChild(this.button);
                } else {
                    container.appendChild(this.button);
                }

                this.injected = true;
                console.log('🔔 CPU Follow: Botón inyectado ✅', this.currentAnimeData.title);

            } catch (error) {
                console.error('🔔 CPU Follow: Error creando botón:', error);
            }
        }

        updateButtonContent() {
            if (!this.button) return;
            if (this.isFollowing) {
                this.button.innerHTML = '<span class="bell-icon">🔔</span><span>Siguiendo</span>';
            } else {
                this.button.innerHTML = '<span class="bell-icon">🔕</span><span>Seguir Anime</span>';
            }
        }

        async toggleFollow() {
            try {
                const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');

                if (this.isFollowing) {
                    // ---- Unfollow ----
                    const updated = followedAnimes.filter(a => a.id !== this.currentAnimeData.id);
                    await chrome.storage.sync.set({ followedAnimes: updated });
                    this.isFollowing = false;
                    this.button.classList.remove('active');
                    this.updateButtonContent();
                    this.showToast(`❌ Dejaste de seguir "${this.currentAnimeData.title}"`);

                } else {
                    // ---- Follow ----
                    // Refresh data in case page changed
                    this.currentAnimeData = this.extractAnimeData();
                    const newAnime = {
                        ...this.currentAnimeData,
                        addedDate: Date.now(),
                        lastChecked: Date.now()
                    };
                    followedAnimes.push(newAnime);
                    await chrome.storage.sync.set({ followedAnimes });
                    this.isFollowing = true;
                    this.button.classList.add('active');
                    this.updateButtonContent();
                    this.showToast(`✅ ¡Ahora sigues "${this.currentAnimeData.title}"!`);
                }

            } catch (error) {
                console.error('🔔 CPU Follow: Error al toggle follow:', error);
                this.showToast('❌ Error al actualizar seguimiento');
            }
        }

        extractAnimeData() {
            const data = {
                id: '',
                title: '',
                thumbnail: '',
                url: '',
                lastEpisode: 0,
                airDay: null,
                airTime: null,
            };

            // --- ID from URL ---
            const match = window.location.pathname.match(/\/series\/([A-Z0-9]+)/i);
            if (match) {
                data.id = match[1];
            }

            // --- Title ---
            const titleCandidates = [
                document.querySelector('meta[property="og:title"]'),
                document.querySelector('h1[class*="title"]'),
                document.querySelector('[class*="series-title"]'),
                document.querySelector('h1'),
            ];
            for (const el of titleCandidates) {
                const text = el?.content || el?.textContent?.trim();
                if (text) { data.title = text.replace(/ - Crunchyroll$/i, '').trim(); break; }
            }

            // --- Thumbnail ---
            const thumbCandidates = [
                document.querySelector('meta[property="og:image"]'),
                document.querySelector('[class*="poster"] img'),
                document.querySelector('[class*="hero"] img'),
            ];
            for (const el of thumbCandidates) {
                const src = el?.content || el?.src;
                if (src) { data.thumbnail = src; break; }
            }

            // --- URL (clean) ---
            data.url = window.location.origin + window.location.pathname;

            // --- Last episode number ---
            const episodeEls = document.querySelectorAll(
                '[data-episode-num], a[href*="/watch/"], [class*="episode"]'
            );
            const nums = [];
            episodeEls.forEach(el => {
                const dn = el.getAttribute('data-episode-num');
                if (dn) { const n = parseInt(dn); if (n > 0) nums.push(n); }
                const text = (el.textContent || '').trim();
                const m = text.match(/(?:episode|ep\.?|e)\s*(\d+)/i);
                if (m) { const n = parseInt(m[1]); if (n > 0) nums.push(n); }
            });
            if (nums.length > 0) data.lastEpisode = Math.max(...nums);

            console.log('🔔 CPU Follow: Datos extraídos:', data);
            return data;
        }

        showToast(message) {
            // Remove existing toast
            document.querySelectorAll('.powerup-follow-toast').forEach(t => t.remove());

            const toast = document.createElement('div');
            toast.className = 'powerup-follow-toast';
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => toast.remove(), 3200);
        }
    }

    // ============================================
    // INITIALIZE
    // ============================================

    const manager = new FollowButtonManager();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => manager.init());
    } else {
        manager.init();
    }

})();
