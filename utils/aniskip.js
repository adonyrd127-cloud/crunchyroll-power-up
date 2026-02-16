// AniSkip Utility for Crunchyroll Power Up
// Fetches skip times (op, ed, recap) using AniSkip API

class AniSkipService {
    constructor() {
        this.baseUrl = 'https://api.aniskip.com/v2';
        this.cache = {};
        this.malIdCache = {};
    }

    /**
     * Get skip times for a specific series and episode
     * @param {string} seriesSlug - The Crunchyroll series slug (e.g., "one-piece")
     * @param {number} episodeNumber - The episode number
     * @returns {Promise<Array>} - Array of skippers or null
     */
    async getSkipTimes(seriesSlug, episodeNumber) {
        const cacheKey = `${seriesSlug}-${episodeNumber}`;
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        try {
            const malId = await this.getMalId(seriesSlug);
            if (!malId) {
                console.warn("Crunchyroll Power Up: Could not find MAL ID for", seriesSlug);
                return null;
            }

            console.log(`Crunchyroll Power Up: Fetching skip times for MAL ID ${malId}, Ep ${episodeNumber}`);

            const response = await fetch(`${this.baseUrl}/skip-times/${malId}/${episodeNumber}?types=op,ed,recap&episodeLength=0`);
            const data = await response.json();

            if (!data.found) {
                console.log("Crunchyroll Power Up: No skip times found on AniSkip");
                return [];
            }

            const skippers = data.results.map(result => ({
                start: result.interval.startTime,
                end: result.interval.endTime,
                type: this.mapType(result.skipType)
            }));

            this.cache[cacheKey] = skippers;
            return skippers;

        } catch (error) {
            console.error("Crunchyroll Power Up: Error fetching skip times", error);
            return null;
        }
    }

    /**
     * Map AniSkip types to our internal types
     */
    mapType(aniSkipType) {
        switch (aniSkipType) {
            case 'op': return 'intro';
            case 'ed': return 'ending'; // 'ending' or 'outro'? content.js uses 'ending' and 'outro' mixed?
            // Default settings has autoSkipEnding/autoSkipOutro, but mapping maps autoSkipEnding to skip_event_ending.
            // NativeSkipper uses 'intro', 'recap', 'ending'.
            case 'recap': return 'recap';
            default: return 'intro';
        }
    }

    /**
     * Resolve MAL ID from AniList
     * @param {string} query - Series slug or title
     */
    async getMalId(query) {
        if (this.malIdCache[query]) {
            return this.malIdCache[query];
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'anilist',
                data: {
                    query: `query {
                        Media(search: "${query}", type: ANIME) {
                            idMal
                        }
                    }`
                }
            }, (response) => {
                if (response && response.data && response.data.Media && response.data.Media.idMal) {
                    const idMal = response.data.Media.idMal;
                    this.malIdCache[query] = idMal;
                    resolve(idMal);
                } else {
                    resolve(null);
                }
            });
        });
    }
}

// Export global instance
window.AniSkip = new AniSkipService();
