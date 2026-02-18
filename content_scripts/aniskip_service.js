// ============================================
// AniSkip Hybrid Service for Crunchyroll Power Up
// Enhanced skip timestamp resolution with Jikan API + AniList fallback
// ============================================

class AniSkipHybridService {
    constructor() {
        this.apiBase = 'https://api.aniskip.com/v2';
        this.jikanBase = 'https://api.jikan.moe/v4';
        this.cache = new Map();
        this.cleanOldCache();
    }

    // ============================================
    // MAIN ORCHESTRATOR
    // ============================================

    /**
     * Get skip times for the current episode being watched.
     * @returns {Promise<{intro, recap, outro} | null>}
     */
    async getSkipTimesForCurrentEpisode() {
        try {
            const title = this.getAnimeTitleFromPage();
            if (!title) {
                console.warn('⏭️ AniSkipHybrid: No se pudo obtener título del anime');
                return null;
            }

            const episodeNumber = this.getEpisodeNumber();
            if (!episodeNumber) {
                console.warn('⏭️ AniSkipHybrid: No se pudo obtener número de episodio');
                return null;
            }

            console.log(`⏭️ AniSkipHybrid: Buscando timestamps para "${title}" Ep.${episodeNumber}`);

            const malId = await this.getMalId(title);
            if (!malId) {
                console.warn(`⏭️ AniSkipHybrid: No se encontró MAL ID para "${title}"`);
                return null;
            }

            console.log(`⏭️ AniSkipHybrid: MAL ID encontrado: ${malId}`);

            const skipTimes = await this.getSkipTimes(malId, episodeNumber);
            return skipTimes;

        } catch (error) {
            console.error('⏭️ AniSkipHybrid: Error general:', error);
            return null;
        }
    }

    // ============================================
    // MAL ID RESOLUTION
    // ============================================

    /**
     * Resolve MAL ID from anime title.
     * Priority: localStorage cache → Jikan API → AniList fallback
     */
    async getMalId(title) {
        const cleanTitle = this.cleanTitle(title);
        const cacheKey = `malId_${cleanTitle.toLowerCase().replace(/\s+/g, '_')}`;

        // 1. Check localStorage cache
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            if (data.timestamp && Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
                console.log(`⏭️ MAL ID cache hit: ${data.malId}`);
                return data.malId;
            }
        }

        // 2. Try Jikan API (direct MAL search)
        let malId = await this.searchJikan(cleanTitle);

        // 3. Fallback: AniList → MAL ID
        if (!malId) {
            malId = await this.searchAniList(cleanTitle);
        }

        // 4. Cache result
        if (malId) {
            localStorage.setItem(cacheKey, JSON.stringify({
                malId,
                title: cleanTitle,
                timestamp: Date.now()
            }));
        }

        return malId;
    }

    /**
     * Search Jikan API (MyAnimeList) for MAL ID.
     * GET https://api.jikan.moe/v4/anime?q={title}&limit=5
     */
    async searchJikan(title) {
        try {
            const url = `${this.jikanBase}/anime?q=${encodeURIComponent(title)}&limit=5`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`⏭️ Jikan API error: HTTP ${response.status}`);
                return null;
            }

            const data = await response.json();

            if (data.data && data.data.length > 0) {
                const best = data.data[0];
                console.log(`⏭️ Jikan encontró: "${best.title}" (MAL ID: ${best.mal_id})`);
                return best.mal_id;
            }

            return null;
        } catch (error) {
            console.error('⏭️ Jikan API error:', error);
            return null;
        }
    }

    /**
     * Fallback: Search AniList for MAL ID via chrome.runtime.sendMessage.
     */
    async searchAniList(title) {
        try {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'anilist',
                    data: {
                        query: `query {
                            Media(search: "${title.replace(/"/g, '\\"')}", type: ANIME) {
                                idMal
                            }
                        }`
                    }
                }, (response) => {
                    if (response && response.data && response.data.Media && response.data.Media.idMal) {
                        console.log(`⏭️ AniList fallback encontró MAL ID: ${response.data.Media.idMal}`);
                        resolve(response.data.Media.idMal);
                    } else {
                        resolve(null);
                    }
                });
            });
        } catch (error) {
            console.error('⏭️ AniList fallback error:', error);
            return null;
        }
    }

    // ============================================
    // SKIP TIMES FROM ANISKIP API
    // ============================================

    /**
     * Fetch skip times from AniSkip API.
     * GET https://api.aniskip.com/v2/skip-times/{malId}/{episode}?types[]=op&types[]=ed&types[]=recap&types[]=mixed-op&types[]=mixed-ed
     * @returns {{intro, recap, outro} | null}
     */
    async getSkipTimes(malId, episodeNumber) {
        const cacheKey = `aniskip_${malId}_${episodeNumber}`;

        // Check memory cache
        if (this.cache.has(cacheKey)) {
            console.log('⏭️ AniSkip cache hit');
            return this.cache.get(cacheKey);
        }

        // Check localStorage cache
        const stored = localStorage.getItem(`aniskip_timestamp_${cacheKey}`);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.timestamp && Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    this.cache.set(cacheKey, data.skipTimes);
                    return data.skipTimes;
                }
            } catch (e) { /* ignore */ }
        }

        try {
            const types = ['op', 'ed', 'recap', 'mixed-op', 'mixed-ed'];
            const params = types.map(t => `types[]=${t}`).join('&');
            const url = `${this.apiBase}/skip-times/${malId}/${episodeNumber}?${params}`;

            const response = await fetch(url);

            if (response.status === 404) {
                console.log('⏭️ AniSkip: No hay timestamps para este episodio');
                return null;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.found || !data.results || data.results.length === 0) {
                console.log('⏭️ AniSkip: No se encontraron resultados');
                return null;
            }

            // Map results to unified structure
            const skipTimes = { intro: null, recap: null, outro: null };

            for (const result of data.results) {
                const interval = {
                    start: result.interval.startTime,
                    end: result.interval.endTime
                };

                switch (result.skipType) {
                    case 'op':
                    case 'mixed-op':
                        if (!skipTimes.intro) skipTimes.intro = interval;
                        break;
                    case 'recap':
                        if (!skipTimes.recap) skipTimes.recap = interval;
                        break;
                    case 'ed':
                    case 'mixed-ed':
                        if (!skipTimes.outro) skipTimes.outro = interval;
                        break;
                }
            }

            console.log('⏭️ AniSkip timestamps:', skipTimes);

            // Cache in memory and localStorage
            this.cache.set(cacheKey, skipTimes);
            localStorage.setItem(`aniskip_timestamp_${cacheKey}`, JSON.stringify({
                skipTimes,
                timestamp: Date.now()
            }));

            return skipTimes;

        } catch (error) {
            console.error('⏭️ AniSkip API error:', error);
            return null;
        }
    }

    // ============================================
    // PAGE DATA EXTRACTION
    // ============================================

    /**
     * Get anime title from the current page.
     */
    getAnimeTitleFromPage() {
        const selectors = [
            'h1[class*="title"]',
            '[class*="series-title"]',
            'meta[property="og:title"]',
            'title'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.tagName === 'META' ? el.content : el.textContent;
                if (text && text.trim()) {
                    return this.cleanTitle(text.trim());
                }
            }
        }

        return null;
    }

    /**
     * Get current episode number from URL, title, or DOM.
     */
    getEpisodeNumber() {
        // Strategy 1: JSON-LD structured data
        try {
            const ldJson = document.querySelector('script[type="application/ld+json"]');
            if (ldJson) {
                const data = JSON.parse(ldJson.innerText);
                if (data && data.episodeNumber) {
                    return parseInt(data.episodeNumber, 10);
                }
            }
        } catch (e) { /* ignore */ }

        // Strategy 2: URL patterns
        const urlPatterns = [
            /episode[-_]?(\d+)/i,
            /\/watch\/[^/]+\/[^/]*?(\d+)\s*$/i,
        ];
        for (const pattern of urlPatterns) {
            const match = window.location.href.match(pattern);
            if (match) return parseInt(match[1], 10);
        }

        // Strategy 3: Page title
        const titleMatch = document.title.match(/E(\d+)/i);
        if (titleMatch) return parseInt(titleMatch[1], 10);

        // Strategy 4: og:title meta
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) {
            const match = metaTitle.content.match(/E(\d+)/i);
            if (match) return parseInt(match[1], 10);
        }

        return null;
    }

    // ============================================
    // UTILITIES
    // ============================================

    /**
     * Clean title for search - remove Crunchyroll-specific text.
     */
    cleanTitle(title) {
        return title
            .replace(/\s*[-–—]\s*Watch on Crunchyroll.*$/i, '')
            .replace(/\s*\|\s*Crunchyroll.*$/i, '')
            .replace(/\s*[-–—]\s*Crunchyroll.*$/i, '')
            .replace(/^Watch\s+/i, '')
            .replace(/\s*\((?:Dub|Sub|English|Spanish|Español|Japanese).*?\)/gi, '')
            .replace(/\s*(?:Dub|Sub)\s*$/i, '')
            .replace(/\s*S\d+\s*E\d+.*$/i, '') // Remove S1E5 etc
            .replace(/\s*Episode\s+\d+.*$/i, '') // Remove "Episode 5..."
            .trim();
    }

    /**
     * Clean old cache entries (> 7 days) from localStorage.
     */
    cleanOldCache() {
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('aniskip_timestamp_') || key.startsWith('malId_'))) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data.timestamp && now - data.timestamp > maxAge) {
                            localStorage.removeItem(key);
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        } catch (e) {
            console.warn('⏭️ Error limpiando cache:', e);
        }
    }
}

// Export global instance
window.aniSkipService = new AniSkipHybridService();
