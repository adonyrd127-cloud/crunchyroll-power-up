// ============================================
// AniList Sync — Episode Sync Engine
// Crunchyroll Power Up Extension
// ============================================

const AniListSync = (() => {
    const SETTINGS_KEY = 'anilist_settings';
    const HISTORY_KEY = 'anilist_history';
    const HISTORY_MAX = 50;

    // Cooldown tracker: "seriesId_episodeNumber" → timestamp
    const _cooldowns = {};
    const COOLDOWN_MS = 15000; // 15 seconds

    /**
     * Read AniList sync settings from chrome.storage.sync.
     * @returns {Promise<Object>}
     */
    async function _getSettings() {
        const data = await chrome.storage.sync.get(SETTINGS_KEY);
        return {
            syncEnabled: true,
            showNotifications: true,
            ...(data[SETTINGS_KEY] || {})
        };
    }

    /**
     * Add an entry to the sync history.
     * @param {Object} entry
     */
    async function _addToHistory(entry) {
        const data = await chrome.storage.local.get(HISTORY_KEY);
        const history = data[HISTORY_KEY] || [];

        history.unshift({
            seriesTitle: entry.seriesTitle,
            episodeNumber: entry.episodeNumber,
            status: entry.status,
            anilistId: entry.anilistId,
            coverImage: entry.coverImage || null,
            syncedAt: Date.now()
        });

        // Keep only the last N entries
        if (history.length > HISTORY_MAX) {
            history.length = HISTORY_MAX;
        }

        await chrome.storage.local.set({ [HISTORY_KEY]: history });
    }

    /**
     * Send a message to the popup (if open).
     * @param {Object} msg
     */
    function _notifyPopup(msg) {
        chrome.runtime.sendMessage({ action: 'anilist_update', ...msg }).catch(() => {
            // Popup may not be open, ignore
        });
    }

    /**
     * Handle episode progress reported from the content script.
     * This is the main sync logic.
     * @param {Object} params
     * @param {string} params.seriesId - Crunchyroll series ID
     * @param {string} params.seriesTitle - Series title
     * @param {number} params.episodeNumber - Episode number
     * @param {number} params.currentTime - Current playback time in seconds
     * @param {number} params.duration - Total video duration in seconds
     */
    async function handleEpisodeProgress({ seriesId, seriesTitle, episodeNumber, currentTime, duration }) {
        try {
            // 1. Check token
            const token = await AniListAuth.getToken();
            if (!token) {
                console.log('[AniList Sync] No hay token activo, ignorando');
                return;
            }

            // 2. Check sync enabled
            const settings = await _getSettings();
            if (!settings.syncEnabled) {
                console.log('[AniList Sync] Sync desactivado');
                return;
            }

            // 3. Minimum playback time
            if (currentTime < 60) {
                return; // Too early, probably still loading/previewing
            }

            // 4. Check 85% threshold
            if (duration > 0 && (currentTime / duration) < 0.85) {
                return;
            }

            // 5. Cooldown check
            const cooldownKey = `${seriesId}_${episodeNumber}`;
            const lastSync = _cooldowns[cooldownKey];
            if (lastSync && (Date.now() - lastSync) < COOLDOWN_MS) {
                return; // Recently synced, skip
            }
            _cooldowns[cooldownKey] = Date.now();

            console.log(`[AniList Sync] Procesando: "${seriesTitle}" Ep.${episodeNumber}`);

            // 6. Resolve AniList ID
            let anilistId = await AniListAPI.getCachedId(seriesId);

            if (!anilistId) {
                const match = await AniListAPI.findBestMatch(seriesTitle);
                if (match) {
                    anilistId = match.id;
                    await AniListAPI.setCachedId(seriesId, anilistId);
                }
            }

            if (!anilistId) {
                // Try progressive title truncation (Crunchyroll Spanish titles
                // concatenate series name + episode subtitle with no separator)
                const words = seriesTitle.split(/\s+/);
                for (let len = Math.max(2, words.length - 2); len >= 2 && !anilistId; len--) {
                    const shorter = words.slice(0, len).join(' ');
                    console.log(`[AniList Sync] Reintentando con título truncado: "${shorter}"`);
                    const retryMatch = await AniListAPI.findBestMatch(shorter);
                    if (retryMatch) {
                        anilistId = retryMatch.id;
                        await AniListAPI.setCachedId(seriesId, anilistId);
                    }
                }
            }

            if (!anilistId) {
                console.warn(`[AniList Sync] No se encontró match para: "${seriesTitle}"`);
                _notifyPopup({ type: 'not_found', seriesTitle });
                return;
            }
            const viewer = await AniListAuth.getViewer();
            if (!viewer) {
                console.error('[AniList Sync] No se pudo obtener datos del usuario');
                return;
            }

            // 9. Check current progress
            const entry = await AniListAPI.getMediaListEntry(anilistId, viewer.id, token);
            // If episodeNumber is 0 (could not be extracted), still allow sync
            // but skip the 'already synced' check since progress >= 0 is always true
            if (episodeNumber > 0 && entry && entry.progress >= episodeNumber) {
                console.log(`[AniList Sync] Ya sincronizado: "${seriesTitle}" Ep.${episodeNumber} (progreso actual: ${entry.progress})`);
                return;
            }
            // If we couldn't determine episode number, use progress + 1
            if (episodeNumber === 0 && entry) {
                episodeNumber = (entry.progress || 0) + 1;
                console.log(`[AniList Sync] Episodio estimado: ${episodeNumber} (progreso actual: ${entry.progress})`);
            }

            // 10. Determine status
            let status = 'CURRENT';
            let coverImage = null;

            try {
                const media = await AniListAPI.getMediaDetails(anilistId, token);
                if (media) {
                    coverImage = media.coverImage?.large || media.coverImage?.medium || null;
                    if (media.episodes && episodeNumber >= media.episodes) {
                        status = 'COMPLETED';
                    }
                }
            } catch (err) {
                console.warn('[AniList Sync] Error obteniendo detalles del media:', err);
            }

            // 11. Update progress
            const result = await AniListAPI.updateProgress(anilistId, episodeNumber, token, status);
            console.log(`[AniList Sync] ✅ Actualizado: "${seriesTitle}" Ep.${episodeNumber} → ${status}`);

            // 12. Save to history
            await _addToHistory({
                seriesTitle,
                episodeNumber,
                status,
                anilistId,
                coverImage
            });

            // 13. Notify popup
            _notifyPopup({
                type: 'success',
                seriesTitle,
                episodeNumber,
                status
            });

            // 14. Chrome notification
            if (settings.showNotifications) {
                const statusText = status === 'COMPLETED' ? '🏆 ¡Completado!' : `Ep. ${episodeNumber} marcado`;
                chrome.notifications.create(`anilist-sync-${Date.now()}`, {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icono chrome.png'),
                    title: '📡 AniList Sync',
                    message: `${seriesTitle} — ${statusText}`,
                    priority: 1
                });
            }

        } catch (error) {
            console.error('[AniList Sync] Error en handleEpisodeProgress:', error);
            _notifyPopup({
                type: 'error',
                seriesTitle: seriesTitle || 'Desconocido',
                error: error.message
            });
        }
    }

    /**
     * Sync all items from the "continue watching" storage as completed.
     * @returns {Promise<{synced: Array, failed: Array}>}
     */
    async function syncAllWatched() {
        const result = { synced: [], failed: [] };

        try {
            const data = await chrome.storage.local.get('continue_watching');
            const items = data.continue_watching || [];

            if (items.length === 0) {
                console.log('[AniList Sync] No hay items en continue_watching');
                return result;
            }

            console.log(`[AniList Sync] Sincronizando ${items.length} items...`);

            for (const item of items) {
                try {
                    await handleEpisodeProgress({
                        seriesId: item.seriesId || item.id || '',
                        seriesTitle: item.seriesTitle || item.title || '',
                        episodeNumber: item.episodeNumber || item.episode || 1,
                        currentTime: item.duration || 9999,
                        duration: item.duration || 9999
                    });
                    result.synced.push(item.seriesTitle || item.title || 'Unknown');
                } catch (err) {
                    console.error(`[AniList Sync] Error sincronizando "${item.seriesTitle}":`, err);
                    result.failed.push(item.seriesTitle || item.title || 'Unknown');
                }

                // Delay between syncs to respect rate limits
                await new Promise(r => setTimeout(r, 500));
            }

            console.log(`[AniList Sync] Sincronización masiva completada: ${result.synced.length} ok, ${result.failed.length} fallidos`);
        } catch (error) {
            console.error('[AniList Sync] Error en syncAllWatched:', error);
        }

        return result;
    }

    return {
        handleEpisodeProgress,
        syncAllWatched,
        _getSettings
    };
})();
