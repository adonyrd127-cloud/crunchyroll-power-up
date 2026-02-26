// ============================================
// AniList API — GraphQL Client
// Crunchyroll Power Up Extension
// ============================================

const AniListAPI = (() => {
    const API_URL = 'https://graphql.anilist.co';
    const CACHE_KEY = 'anilist_id_cache';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    // ─── Core GraphQL Fetch ───────────────────────────────

    /**
     * Execute a GraphQL query/mutation against the AniList API.
     * Handles 429 rate limiting with automatic retry using Retry-After header.
     * @param {string} query - GraphQL query string
     * @param {Object} variables - Query variables
     * @param {string} [token] - Optional auth token
     * @param {number} [retries=2] - Number of retries on rate limit
     * @returns {Promise<Object>} The `data` field from the response
     */
    async function _gql(query, variables = {}, token = null, retries = 2) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables })
        });

        // Handle rate limiting
        if (response.status === 429 && retries > 0) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            console.warn(`[AniList API] Rate limited. Reintentando en ${retryAfter}s...`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            return _gql(query, variables, token, retries - 1);
        }

        // Try to parse JSON even on non-200 (AniList returns JSON errors with 404)
        let json;
        try {
            json = await response.json();
        } catch (e) {
            if (!response.ok) {
                throw new Error(`AniList API HTTP ${response.status}`);
            }
            throw new Error('AniList API: invalid JSON response');
        }

        // Check for GraphQL errors (may come with 200 or 404 status)
        if (json.errors && json.errors.length > 0) {
            const err = json.errors[0];
            throw new Error(err.message || 'AniList GraphQL error');
        }

        if (!response.ok && !json.data) {
            throw new Error(`AniList API HTTP ${response.status}`);
        }

        return json.data;
    }

    // ─── Search & Matching ────────────────────────────────

    /**
     * Search anime by title on AniList.
     * @param {string} title - Search term
     * @param {string} [token] - Optional auth token
     * @returns {Promise<Array>} Array of media results
     */
    async function searchAnime(title, token = null) {
        const query = `
      query ($search: String) {
        Page(perPage: 10) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            title { romaji english native userPreferred }
            format
            status
            episodes
            synonyms
          }
        }
      }
    `;

        const data = await _gql(query, { search: title }, token);
        return data?.Page?.media || [];
    }

    /**
     * Clean a Crunchyroll title for search.
     * Removes season/part/cour/temporada markers and other noise.
     * @param {string} title
     * @returns {string}
     */
    function _cleanTitle(title) {
        return title
            .replace(/\s*[-–—]\s*Crunchyroll.*$/i, '')
            .replace(/\s*\((?:Dub|Sub|English|Spanish|Español|Japanese|Latino).*?\)/gi, '')
            .replace(/\s*(?:Dub|Sub)\s*$/i, '')
            .replace(/\s*Season\s*\d+/gi, '')
            .replace(/\s*Part\s*\d+/gi, '')
            .replace(/\s*Cour\s*\d+/gi, '')
            .replace(/\s*Temporada\s*\d+/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate Jaccard similarity between two strings using word tokens.
     * @param {string} a
     * @param {string} b
     * @returns {number} Score between 0 and 1
     */
    function _jaccard(a, b) {
        const tokenize = (s) => new Set(
            s.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 0)
        );

        const setA = tokenize(a);
        const setB = tokenize(b);

        if (setA.size === 0 && setB.size === 0) return 1;
        if (setA.size === 0 || setB.size === 0) return 0;

        let intersection = 0;
        for (const word of setA) {
            if (setB.has(word)) intersection++;
        }

        const union = new Set([...setA, ...setB]).size;
        return intersection / union;
    }

    /**
     * Find the best AniList match for a Crunchyroll series title.
     * @param {string} seriesTitle - Raw title from Crunchyroll
     * @returns {Promise<Object|null>} Best match media object or null
     */
    async function findBestMatch(seriesTitle) {
        const cleanedTitle = _cleanTitle(seriesTitle);

        if (!cleanedTitle || cleanedTitle.length < 2) {
            console.warn('[AniList] Título demasiado corto para buscar:', seriesTitle);
            return null;
        }

        const token = await AniListAuth.getToken();
        const results = await searchAnime(cleanedTitle, token);

        if (!results || results.length === 0) {
            console.log(`[AniList] Sin resultados para: "${cleanedTitle}"`);
            return null;
        }

        let bestMatch = null;
        let bestScore = 0;

        for (const media of results) {
            // Gather all possible titles
            const candidates = [
                media.title?.romaji,
                media.title?.english,
                media.title?.native,
                media.title?.userPreferred,
                ...(media.synonyms || [])
            ].filter(Boolean);

            for (const candidate of candidates) {
                const score = _jaccard(cleanedTitle, candidate);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = media;
                }
            }
        }

        if (bestScore >= 0.35 && bestMatch) {
            const matchTitle = bestMatch.title?.userPreferred || bestMatch.title?.romaji || '?';
            console.log(`[AniList] "${cleanedTitle}" → "${matchTitle}" (score: ${bestScore.toFixed(2)})`);
            return bestMatch;
        }

        console.log(`[AniList] Sin match suficiente para "${cleanedTitle}" (mejor score: ${bestScore.toFixed(2)})`);
        return null;
    }

    // ─── ID Cache ─────────────────────────────────────────

    /**
     * Get a cached AniList ID for a Crunchyroll series ID.
     * @param {string} crunchyrollId
     * @returns {Promise<number|null>}
     */
    async function getCachedId(crunchyrollId) {
        const data = await chrome.storage.local.get(CACHE_KEY);
        const cache = data[CACHE_KEY] || {};
        const entry = cache[crunchyrollId];

        if (entry && (Date.now() - entry.at) < CACHE_TTL) {
            return entry.id;
        }

        return null;
    }

    /**
     * Save an AniList ID mapping for a Crunchyroll series ID.
     * @param {string} crunchyrollId
     * @param {number} anilistId
     */
    async function setCachedId(crunchyrollId, anilistId) {
        const data = await chrome.storage.local.get(CACHE_KEY);
        const cache = data[CACHE_KEY] || {};

        cache[crunchyrollId] = { id: anilistId, at: Date.now() };

        // Prune expired entries
        const now = Date.now();
        for (const key of Object.keys(cache)) {
            if ((now - cache[key].at) > CACHE_TTL) {
                delete cache[key];
            }
        }

        await chrome.storage.local.set({ [CACHE_KEY]: cache });
    }

    // ─── Media List Operations ────────────────────────────

    /**
     * Get the current user's list entry for a media.
     * @param {number} mediaId - AniList media ID
     * @param {number} userId - AniList user ID
     * @param {string} token - Auth token
     * @returns {Promise<Object|null>} MediaList entry or null
     */
    async function getMediaListEntry(mediaId, userId, token) {
        const query = `
      query ($mediaId: Int, $userId: Int) {
        MediaList(mediaId: $mediaId, userId: $userId) {
          id
          status
          progress
          score
        }
      }
    `;

        try {
            const data = await _gql(query, { mediaId, userId }, token);
            return data?.MediaList || null;
        } catch (error) {
            // "Not Found" is normal for anime not on user's list
            if (error.message && error.message.includes('Not Found')) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Update progress for a media entry on the user's list.
     * @param {number} mediaId - AniList media ID
     * @param {number} progress - Episode number watched
     * @param {string} token - Auth token
     * @param {string} [status='CURRENT'] - List status
     * @returns {Promise<Object>} Updated entry
     */
    async function updateProgress(mediaId, progress, token, status = 'CURRENT') {
        const query = `
      mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
          id
          status
          progress
          media {
            title { userPreferred }
            episodes
          }
        }
      }
    `;

        const data = await _gql(query, { mediaId, progress, status }, token);
        return data?.SaveMediaListEntry;
    }

    /**
     * Get media details (episode count, cover image).
     * @param {number} mediaId - AniList media ID
     * @param {string} [token] - Optional auth token
     * @returns {Promise<Object|null>}
     */
    async function getMediaDetails(mediaId, token = null) {
        const query = `
      query ($id: Int) {
        Media(id: $id) {
          id
          episodes
          title { userPreferred }
          coverImage { large medium }
          status
        }
      }
    `;

        const data = await _gql(query, { id: mediaId }, token);
        return data?.Media || null;
    }

    return {
        _gql,
        searchAnime,
        findBestMatch,
        getCachedId,
        setCachedId,
        getMediaListEntry,
        updateProgress,
        getMediaDetails,
        _cleanTitle,
        _jaccard
    };
})();
