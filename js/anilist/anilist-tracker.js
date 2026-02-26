// ============================================
// AniList Tracker — Content Script
// Injected on all Crunchyroll pages (all_frames: true)
// Detects <video> in any frame and reports progress
// Background script extracts episode info from tab URL
// Crunchyroll Power Up Extension
// ============================================

(function () {
    'use strict';

    // Guard against double injection per frame
    if (window.__anilistTrackerV2) return;
    window.__anilistTrackerV2 = true;

    const isMainFrame = (window === window.top);
    const frameLabel = isMainFrame ? 'main' : 'iframe';

    console.log(`[AniList Tracker] (${frameLabel}) Inicializado`);

    // ─── State ──────────────────────────────────────────
    let _videoAttached = false;
    let _lastReported = false;
    let _progressInterval = null;

    // ─── Episode Info Extraction (main frame only) ──────
    // Extracts seriesTitle and episodeNumber from the page DOM
    // and sends to background to cache per tab.
    function extractAndSendPageInfo() {
        if (!isMainFrame) return;
        if (!location.href.includes('/watch/')) return;

        // Wait for page to render
        setTimeout(() => {
            let episodeNumber = 0;
            let seriesTitle = '';

            // Strategy 1: JSON-LD (most reliable)
            try {
                const ldJson = document.querySelector('script[type="application/ld+json"]');
                if (ldJson) {
                    const data = JSON.parse(ldJson.textContent);
                    if (data && data.episodeNumber) {
                        episodeNumber = parseInt(data.episodeNumber, 10);
                    }
                    if (data && data.partOfSeries && data.partOfSeries.name) {
                        seriesTitle = data.partOfSeries.name;
                    }
                }
            } catch (e) { /* ignore parsing errors */ }

            // Strategy 2: Page elements (e.g., "E6 – El aprendiz...")
            if (!episodeNumber) {
                const episodeEl = document.querySelector('[class*="episode"] h4, .hero-heading-line h4, h4');
                if (episodeEl) {
                    const text = episodeEl.textContent || '';
                    const m = text.match(/^E(\d+)\s*[-–—]/);
                    if (m) episodeNumber = parseInt(m[1], 10);
                }
            }

            // Strategy 3: Series title from the page link/heading
            if (!seriesTitle) {
                const seriesEl = document.querySelector('a[href*="/series/"] h4, .hero-heading-line a');
                if (seriesEl) seriesTitle = seriesEl.textContent.trim();
            }

            if (episodeNumber || seriesTitle) {
                console.log(`[AniList Tracker] (main) Página info: "${seriesTitle}" Ep.${episodeNumber}`);
                chrome.runtime.sendMessage({
                    type: 'anilist_page_info',
                    episodeNumber,
                    seriesTitle
                }).catch(() => { });
            }
        }, 2000);  // Wait 2s for Crunchyroll SPA to render
    }

    // ─── Progress Reporting ─────────────────────────────
    // Sends minimal data — the background will extract episode info
    // from sender.tab.url (avoids cross-origin issues in iframes)

    function reportProgress(videoEl, forceComplete = false) {
        const currentTime = forceComplete ? videoEl.duration : videoEl.currentTime;
        const duration = videoEl.duration;

        if (!duration || isNaN(duration) || duration <= 0) return;

        const percentage = Math.round((currentTime / duration) * 100);
        console.log(`[AniList Tracker] (${frameLabel}) Reportando progreso: ${percentage}%`);

        chrome.runtime.sendMessage({
            type: 'anilist_episode_progress',
            currentTime: currentTime,
            duration: duration
        }).catch(() => {
            // Extension context may be invalid — ignore
        });
    }

    // ─── Video Attachment ───────────────────────────────

    function attachVideo(videoEl) {
        if (_videoAttached) return;
        _videoAttached = true;
        _lastReported = false;

        console.log(`[AniList Tracker] (${frameLabel}) ✅ Video adjuntado`);

        // Clear any existing interval
        if (_progressInterval) clearInterval(_progressInterval);

        // Periodic check every 30s
        _progressInterval = setInterval(() => {
            if (videoEl && !videoEl.paused && !videoEl.ended && videoEl.duration > 0) {
                const pct = videoEl.currentTime / videoEl.duration;
                if (pct >= 0.85 && !_lastReported) {
                    _lastReported = true;
                    reportProgress(videoEl, true);
                }
            }
        }, 30000);

        // On video end
        videoEl.addEventListener('ended', () => {
            console.log(`[AniList Tracker] (${frameLabel}) Video terminado`);
            if (!_lastReported) {
                _lastReported = true;
                reportProgress(videoEl, true);
            }
        });

        // On timeupdate — check 85% threshold
        videoEl.addEventListener('timeupdate', () => {
            if (_lastReported) return;
            if (!videoEl.duration || videoEl.duration <= 0) return;

            const percentage = videoEl.currentTime / videoEl.duration;
            if (percentage >= 0.85) {
                console.log(`[AniList Tracker] (${frameLabel}) ≥85% alcanzado!`);
                _lastReported = true;
                reportProgress(videoEl, true);
            }
        });
    }

    // ─── Video Detection ────────────────────────────────

    function tryAttachVideo() {
        if (_videoAttached) return true;

        let video = document.querySelector('video');
        if (video) {
            attachVideo(video);
            return true;
        }

        // Search in shadow DOMs
        const candidates = document.querySelectorAll('[class*="player"], [class*="video"], [id*="player"], [id*="video"]');
        for (const el of candidates) {
            if (el.shadowRoot) {
                video = el.shadowRoot.querySelector('video');
                if (video) {
                    attachVideo(video);
                    return true;
                }
            }
        }

        return false;
    }

    // ─── MutationObserver — always active ───────────────

    const observer = new MutationObserver(() => {
        if (_videoAttached) return;
        tryAttachVideo();
    });

    const target = document.body || document.documentElement;
    if (target) {
        observer.observe(target, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    // ─── SPA Navigation Detection (main frame only) ────

    if (isMainFrame) {
        let _currentUrl = location.href;

        setInterval(() => {
            if (location.href !== _currentUrl) {
                _currentUrl = location.href;

                if (_currentUrl.includes('/watch/')) {
                    console.log('[AniList Tracker] (main) SPA nav a watch:', _currentUrl);
                    _videoAttached = false;
                    _lastReported = false;
                    if (_progressInterval) {
                        clearInterval(_progressInterval);
                        _progressInterval = null;
                    }
                    // Video detection will happen via MutationObserver
                    // Re-extract page info for new episode
                    extractAndSendPageInfo();
                }
            }
        }, 1000);
    }

    // ─── Initial attempt ────────────────────────────────
    tryAttachVideo();
    extractAndSendPageInfo();

})();
