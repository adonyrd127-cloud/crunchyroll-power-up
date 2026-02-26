// ============================================
// AniList Auth — Personal Access Token Manager
// Crunchyroll Power Up Extension
// ============================================

const AniListAuth = (() => {
    const STORAGE_TOKEN = 'anilist_token';
    const STORAGE_VIEWER = 'anilist_viewer';
    const API_URL = 'https://graphql.anilist.co';

    const VIEWER_QUERY = `
    query {
      Viewer {
        id
        name
        avatar { large medium }
        siteUrl
        statistics { anime { count episodesWatched } }
      }
    }
  `;

    /**
     * Fetch viewer data from AniList API using the given token.
     * @param {string} token - AniList Personal Access Token
     * @returns {Promise<Object>} Viewer data
     */
    async function _fetchViewer(token) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query: VIEWER_QUERY })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`AniList API error ${response.status}: ${text}`);
        }

        const json = await response.json();

        if (json.errors && json.errors.length > 0) {
            throw new Error(json.errors[0].message || 'Token inválido');
        }

        if (!json.data || !json.data.Viewer) {
            throw new Error('No se pudo obtener datos del usuario. Token inválido.');
        }

        return json.data.Viewer;
    }

    /**
     * Validate and save a Personal Access Token.
     * Calls the Viewer query to verify the token is valid before saving.
     * @param {string} token - AniList Personal Access Token
     * @returns {Promise<Object>} Viewer data if successful
     */
    async function saveToken(token) {
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            throw new Error('Token vacío o inválido');
        }

        token = token.trim();
        console.log('[AniList Auth] Verificando token...');

        const viewer = await _fetchViewer(token);

        await chrome.storage.local.set({
            [STORAGE_TOKEN]: token,
            [STORAGE_VIEWER]: viewer
        });

        console.log(`[AniList Auth] Conectado como: ${viewer.name} (ID: ${viewer.id})`);
        return viewer;
    }

    /**
     * Remove token and viewer data from storage.
     */
    async function logout() {
        await chrome.storage.local.remove([STORAGE_TOKEN, STORAGE_VIEWER]);
        console.log('[AniList Auth] Sesión cerrada');
    }

    /**
     * Get the stored token, or null if not logged in.
     * @returns {Promise<string|null>}
     */
    async function getToken() {
        const data = await chrome.storage.local.get(STORAGE_TOKEN);
        return data[STORAGE_TOKEN] || null;
    }

    /**
     * Check if a token is currently stored.
     * @returns {Promise<boolean>}
     */
    async function isLoggedIn() {
        const token = await getToken();
        return !!token;
    }

    /**
     * Get viewer data. Returns cached version unless forceRefresh is true.
     * @param {boolean} [forceRefresh=false] - Force a fresh API call
     * @returns {Promise<Object|null>} Viewer data or null
     */
    async function getViewer(forceRefresh = false) {
        if (!forceRefresh) {
            const data = await chrome.storage.local.get(STORAGE_VIEWER);
            if (data[STORAGE_VIEWER]) {
                return data[STORAGE_VIEWER];
            }
        }

        const token = await getToken();
        if (!token) return null;

        try {
            const viewer = await _fetchViewer(token);
            await chrome.storage.local.set({ [STORAGE_VIEWER]: viewer });
            return viewer;
        } catch (error) {
            console.error('[AniList Auth] Error al refrescar viewer:', error);
            return null;
        }
    }

    return {
        saveToken,
        logout,
        getToken,
        isLoggedIn,
        getViewer,
        _fetchViewer
    };
})();
