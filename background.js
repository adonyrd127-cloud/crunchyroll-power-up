// Extensión Crunchyroll Power Up - Script de Fondo
// Author: Ing. Adony R.

// Load RSS parser module
importScripts('rss-parser.js');

// Load AniList sync modules
importScripts(
  'js/anilist/anilist-auth.js',
  'js/anilist/anilist-api.js',
  'js/anilist/anilist-sync.js'
);

// Configuración predeterminada compatible con el formato del repositorio original
// Configuración predeterminada simplificada (camelCase)
const defaultSettings = {
  // Configuración de salto
  autoSkipIntro: false,
  autoSkipRecap: false,
  autoSkipEnding: false,
  autoSkipOutro: false,

  // Configuración general
  theaterMode: false,
  nextEpisodeDate: true,
  miniPlayerEnabled: false,
  calendarFilter: false,

  // Otras configuraciones (mantenidas por compatibilidad o uso futuro)
  enhancedPlayer: true,
  customTheme: 'dark',
  forceVideoQuality: false,
  selectedQuality: '1080p',
  videoQuality: '1080p', // Alias
  subtitleFont: 'Default',
  uiCustomization: true,
  marathonMode: true,
  malSync: false,
  anilistSync: false,
  subtitleTranslator: false,
  targetLanguage: 'en',
  commentTranslator: false,
  sleepTimerEnabled: false,
  sleepTimerMinutes: 60,
  videoFiltersEnabled: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  nightMode: false,

  // Nuevas características
  communityRatings: true,
  seasonProgress: true,

  // Configuración del reproductor
  player_auto_fullscreen: false,
  player_auto_theater: true,
  player_auto_next: true,
  player_speed_controls: true,
  player_quality_controls: true,

  // Configuración de la interfaz de usuario
  ui_hide_comments: false,
  ui_hide_related: false,
  ui_compact_mode: false
};

// Inicializar extensión
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Crunchyroll Power Up: Script de fondo instalado');

  try {
    // Obtener configuración existente
    const existingSettings = await chrome.storage.sync.get(null);

    // Migración simple: si existen las antiguas keys (skip_event_...), convertirlas
    if (existingSettings.skip_event_intro !== undefined && existingSettings.autoSkipIntro === undefined) {
      existingSettings.autoSkipIntro = existingSettings.skip_event_intro === 1;
      delete existingSettings.skip_event_intro;
    }
    if (existingSettings.skip_event_recap !== undefined && existingSettings.autoSkipRecap === undefined) {
      existingSettings.autoSkipRecap = existingSettings.skip_event_recap === 1;
      delete existingSettings.skip_event_recap;
    }
    if (existingSettings.skip_event_ending !== undefined && existingSettings.autoSkipEnding === undefined) {
      existingSettings.autoSkipEnding = existingSettings.skip_event_ending === 1;
      delete existingSettings.skip_event_ending;
    }

    // Fusionar con valores predeterminados
    const mergedSettings = { ...defaultSettings, ...existingSettings };

    // Guardar configuración fusionada y limpia
    await chrome.storage.sync.set(mergedSettings);
    console.log('Crunchyroll Power Up: Configuración inicializada:', mergedSettings);

    // === MIGRACIÓN DE SYNC A LOCAL PARA FOLLOWEDANIMES ===
    const syncData = await chrome.storage.sync.get('followedAnimes');
    if (syncData.followedAnimes) {
      console.log('Crunchyroll Power Up: Migrando followedAnimes de sync a local...', syncData.followedAnimes.length);
      await chrome.storage.local.set({ followedAnimes: syncData.followedAnimes });
      await chrome.storage.sync.remove('followedAnimes');
    }

    // === ANIME TRACKING: Initialize alarm & default notification settings ===
    chrome.alarms.create('checkNewEpisodes', {
      periodInMinutes: 30,
      delayInMinutes: 1
    });
    console.log('🔔 Alarma de verificación de episodios creada (cada 30 min)');

    const { notificationSettings } = await chrome.storage.sync.get('notificationSettings');
    if (!notificationSettings) {
      await chrome.storage.sync.set({
        notificationSettings: {
          enabled: true,
          quietHoursEnabled: true,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          notifyNewEpisode: true,
          soundEnabled: true
        }
      });
    }

  } catch (error) {
    console.error('Crunchyroll Power Up: Error al inicializar la configuración:', error);
  }
});

// ============================================
// BROWSER STARTUP: Check immediately + ensure alarm exists
// ============================================
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Navegador iniciado — verificando episodios inmediatamente...');

  // Ensure the periodic alarm exists (it may have been lost on restart)
  const existingAlarm = await chrome.alarms.get('checkNewEpisodes');
  if (!existingAlarm) {
    chrome.alarms.create('checkNewEpisodes', {
      periodInMinutes: 30,
      delayInMinutes: 1
    });
    console.log('🔔 Alarma recreada al iniciar navegador');
  }

  // Run an immediate check (don't wait 30 minutes)
  try {
    await checkForNewEpisodes();
    console.log('✅ Verificación al inicio completada');
  } catch (error) {
    console.error('❌ Error en verificación al inicio:', error);
  }
});

// Escuchar cambios de configuración y storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // console.log('Crunchyroll Power Up: La configuración cambió:', changes);
  }
});

// Manejar mensajes de los scripts de contenido
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Crunchyroll Power Up: Mensaje recibido:', message);

  switch (message.type) {
    case 'getTabUrl':
      // Allow content scripts in iframes to retrieve the tab's top-level URL
      if (sender.tab && sender.tab.url) {
        sendResponse({ success: true, url: sender.tab.url });
      } else {
        sendResponse({ success: false, url: null });
      }
      return false; // Synchronous response

    case 'getSettings':
      chrome.storage.sync.get(null).then(settings => {
        sendResponse({ success: true, settings });
      }).catch(error => {
        console.error('Crunchyroll Power Up: Error al obtener la configuración:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Mantener el canal de mensajes abierto para respuesta asíncrona

    case 'updateSettings':
      chrome.storage.sync.set(message.settings).then(() => {
        console.log('Crunchyroll Power Up: Configuración actualizada con éxito');
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Crunchyroll Power Up: Error al actualizar la configuración:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Mantener el canal de mensajes abierto para respuesta asíncrona

    case 'skipActive':
      // Reenviar comando de salto al script de contenido
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'skipActive' });
        }
      });
      sendResponse({ success: true });
      break;

    case 'MINI_PLAYER_TOGGLE':
      // Manejar el interruptor del Mini Reproductor
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'MINI_PLAYER_TOGGLE',
            enabled: message.enabled
          });
        }
      });
      sendResponse({ success: true });
      break;

    case 'anilist':
      // Manejar solicitudes de la API de AniList
      const { query } = message.data;
      console.log('Crunchyroll Power Up: Petición AniList API:', query);

      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
        .then((response) => response.json())
        .then((json) => {
          console.log('Crunchyroll Power Up: Respuesta AniList API:', json);
          sendResponse(json);
        })
        .catch((error) => {
          console.error('Crunchyroll Power Up: Error AniList API:', error);
          sendResponse({ error: error.message });
        });
      return true; // Mantener el canal de mensajes abierto para respuesta asíncrona

    case 'skipEvents':
      // Obtener skip events nativos de Crunchyroll
      const { mediaId } = message;
      console.log('Crunchyroll Power Up: Obteniendo skip-events para mediaId:', mediaId);

      fetch(`https://static.crunchyroll.com/skip-events/production/${mediaId}.json`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          // Convertir formato CR a nuestro formato interno
          // CR devuelve: { "intro": { "start": 5, "end": 90 }, "credits": { "start": 1320, "end": 1420 } }
          const skipTimes = [];
          for (const [type, { start, end }] of Object.entries(data)) {
            if (typeof start === 'number' && typeof end === 'number') {
              let mappedType = type;
              if (type === 'credits') mappedType = 'ending';
              if (type === 'recap') mappedType = 'recap';
              if (type === 'intro') mappedType = 'intro';
              skipTimes.push({ start, end, type: mappedType });
            }
          }
          console.log('Crunchyroll Power Up: Skip events encontrados:', skipTimes);
          sendResponse({ success: true, skipTimes });
        })
        .catch((error) => {
          console.log('Crunchyroll Power Up: No se encontraron skip events para', mediaId, error.message);
          sendResponse({ success: false, skipTimes: [] });
        });
      return true;

    case 'manualCheck':
      console.log('🔍 Verificación manual de episodios solicitada');
      checkForNewEpisodes().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('Error en verificación manual:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    // Cache for per-tab page info (from main frame DOM extraction)
    case 'anilist_page_info': {
      // Store episode info sent by the tracker in the main frame
      const tabId = sender.tab?.id;
      if (tabId) {
        if (!globalThis._tabPageInfo) globalThis._tabPageInfo = {};
        globalThis._tabPageInfo[tabId] = {
          episodeNumber: message.episodeNumber || 0,
          seriesTitle: message.seriesTitle || '',
          timestamp: Date.now()
        };
        console.log(`[AniList] Cached page info for tab ${tabId}:`, globalThis._tabPageInfo[tabId]);
      }
      sendResponse({ success: true });
      break;
    }

    case 'anilist_save_token':
      AniListAuth.saveToken(message.token)
        .then(viewer => {
          sendResponse({ success: true, viewer });
        })
        .catch(error => {
          console.error('[AniList] Error guardando token:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'anilist_logout':
      AniListAuth.logout()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'anilist_episode_progress': {
      // Extract episode info from tab URL (since content script may be in cross-origin iframe)
      const tabUrl = sender.tab?.url || '';
      const tabTitle = sender.tab?.title || '';
      const tabId = sender.tab?.id;

      // Check cached page info from main frame DOM
      const cachedInfo = (globalThis._tabPageInfo && tabId) ? globalThis._tabPageInfo[tabId] : null;

      console.log('[AniList] Tab info:', { url: tabUrl, title: tabTitle, cached: cachedInfo });

      // Extract seriesId from URL: /watch/XXXXXXX/... or /es/watch/XXXXXXX/...
      const idMatch = tabUrl.match(/\/watch\/([A-Z0-9]+)/i);
      const seriesId = message.seriesId || (idMatch ? idMatch[1] : '');

      // Episode number: prefer cached (from DOM), then URL, then title
      let episodeNumber = message.episodeNumber || (cachedInfo?.episodeNumber) || 0;
      if (!episodeNumber) {
        const epMatch = tabUrl.match(/episode[s]?[-_]?(\d+)/i);
        if (epMatch) episodeNumber = parseInt(epMatch[1], 10);
      }
      if (!episodeNumber) {
        const epShort = tabUrl.match(/\/e[-_]?(\d+)/i);
        if (epShort) episodeNumber = parseInt(epShort[1], 10);
      }
      // Fallback: extract from tab title
      // Crunchyroll uses formats like: "E4 –", "Episode 4", "Episodio 4", "Ep 4", "Ep. 4", "Cap 4"
      if (!episodeNumber && tabTitle) {
        const patterns = [
          /\bS\d+\s*E(\d+)\b/i,              // S1E4
          /\bEp\.?\s*(\d+)\b/i,              // Ep.4, Ep 4
          /\bE(\d+)\s*[-–—]/i,               // E4 –  (before dash)
          /\bE(\d+)\s/i,                      // E4 followed by space
          /\b(?:Episode|Episodio)\s+(\d+)/i,  // Episode 4, Episodio 4
          /\b(?:Cap[íi]tulo|Cap\.?)\s*(\d+)/i // Capítulo 4, Cap 4, Cap. 4
        ];
        for (const pattern of patterns) {
          const m = tabTitle.match(pattern);
          if (m) {
            episodeNumber = parseInt(m[1], 10);
            console.log(`[AniList] Episodio extraído del título: ${episodeNumber} (patrón: ${pattern})`);
            break;
          }
        }
      }

      // Series title: prefer cached (from DOM), then tab title
      let seriesTitle = message.seriesTitle || (cachedInfo?.seriesTitle) || '';
      if (!seriesTitle && tabTitle) {
        seriesTitle = tabTitle
          .replace(/\s*[-–—]\s*(Watch|Ver|Crunchyroll).*$/i, '')
          .replace(/\s*(Episode|Episodio)\s*\d+.*/i, '')
          .replace(/\s*[-–—]\s*Vi.*$/i, '')
          .trim();
      }

      if (!seriesId) {
        console.warn('[AniList] No se pudo extraer seriesId de la URL:', tabUrl);
        sendResponse({ success: false, error: 'No seriesId' });
        return true;
      }

      console.log(`[AniList] Progreso detectado: "${seriesTitle}" Ep.${episodeNumber} (ID: ${seriesId})`);

      AniListSync.handleEpisodeProgress({
        seriesId,
        seriesTitle,
        episodeNumber,
        currentTime: message.currentTime,
        duration: message.duration
      }).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('[AniList] Error en episode progress:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    case 'anilist_manual_sync':
      AniListSync.syncAllWatched()
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      console.log('Crunchyroll Power Up: Tipo de mensaje desconocido:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Manejar clic en el icono de la extensión
chrome.action.onClicked.addListener((tab) => {
  console.log('Crunchyroll Power Up: Icono de la extensión clicado');
  // El popup lo manejará automáticamente
});

// Manejar actualizaciones de pestañas (para detección de navegación SPA)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url &&
    (tab.url.includes('crunchyroll.com') || tab.url.includes('beta.crunchyroll.com'))) {
    console.log('Crunchyroll Power Up: Página de Crunchyroll cargada:', tab.url);

    // Enviar mensaje al script de contenido para reinicializar si es necesario
    chrome.tabs.sendMessage(tabId, { type: 'pageLoaded', url: tab.url }).catch(() => {
      // Content script might not be ready yet, ignore error
    });
  }
});

console.log('Crunchyroll Power Up: Script de fondo cargado correctamente');

// ============================================
// ANIME TRACKING: ALARM LISTENER
// ============================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkNewEpisodes') {
    console.log('⏰ Alarma: Verificando nuevos episodios...');
    checkForNewEpisodes();
  }
});

// ============================================
// ANIME TRACKING: CHECK FOR NEW EPISODES
// ============================================

async function checkForNewEpisodes() {
  try {
    const [localStorage, syncStorage] = await Promise.all([
      chrome.storage.local.get('followedAnimes'),
      chrome.storage.sync.get('notificationSettings')
    ]);
    const followedAnimes = localStorage.followedAnimes || [];
    const settings = syncStorage.notificationSettings || {};

    if (!settings.enabled || !settings.notifyNewEpisode) {
      console.log('🔔 Notificaciones deshabilitadas');
      return;
    }

    if (settings.quietHoursEnabled && isQuietHours(settings)) {
      console.log('⏰ Horario de "no molestar" activo');
      return;
    }

    if (followedAnimes.length === 0) {
      console.log('🔔 No hay animes seguidos');
      return;
    }

    console.log(`🔍 Verificando ${followedAnimes.length} anime(s) [Híbrido RSS + AniList]...`);
    let updatesFound = 0;

    // === PHASE 1: Fetch RSS (primary source) ===
    const rssResult = await getOrFetchRSS();
    const rssItems = rssResult.items;
    const rssOk = !rssResult.error;
    const aliases = await getTitleAliases();

    // Track API health status
    const apiStatus = {
      rss: rssOk ? 'ok' : 'error',
      rssError: rssResult.error || null,
      anilist: 'ok',    // Will be updated below if it fails
      lastCheck: Date.now()
    };

    // === PHASE 2: Check each anime (Batched in parallel) ===
    const BATCH_SIZE = 5;
    let anilistErrorCount = 0;

    for (let i = 0; i < followedAnimes.length; i += BATCH_SIZE) {
      const batch = followedAnimes.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (anime) => {
        try {
          let latestEpisode = 0;
          let detectionSource = 'stale';
          let rssEpisodeUrl = null;

          // --- Try RSS first (primary) ---
          if (rssItems.length > 0) {
            const rssEpisodes = getEpisodesForAnime(anime.title, rssItems, followedAnimes, aliases);

            if (rssEpisodes.length > 0) {
              const newestRss = rssEpisodes[0]; // Already sorted desc
              latestEpisode = newestRss.episodeNumber;
              rssEpisodeUrl = newestRss.link;
              detectionSource = 'rss';
              console.log(`🟢 RSS match: ${anime.title} → Ep.${latestEpisode}`);
            }
          }

          // --- Fallback to AniList if no RSS match ---
          if (detectionSource !== 'rss') {
            try {
              const anilistLatest = await fetchLatestEpisode(anime.url, anime.title, anime.lastEpisode || 0);
              if (anilistLatest > 0) {
                latestEpisode = anilistLatest;
                detectionSource = 'anilist';
                console.log(`🟡 AniList fallback: ${anime.title} → Ep.${latestEpisode}`);
              }
            } catch (anilistErr) {
              console.warn(`⚠️ AniList error for ${anime.title}:`, anilistErr.message);
              anilistErrorCount++;
            }
          }

          // --- If AniList says it aired > 2 hours ago, notify anyway ---
          if (detectionSource === 'anilist' && anime.nextAiringEpisode?.airingAt) {
            const airedAgo = Date.now() / 1000 - anime.nextAiringEpisode.airingAt;
            if (airedAgo > 7200 && latestEpisode <= anime.lastEpisode) {
              // Schedule says it should have aired > 2h ago but episode count hasn't changed
              // Force set to next episode to trigger notification
              latestEpisode = anime.nextAiringEpisode.episode;
              detectionSource = 'anilist';
              console.log(`🟡 AniList schedule override: ${anime.title} → Ep.${latestEpisode} (aired ${Math.round(airedAgo / 3600)}h ago)`);
            }
          }

          // --- Update anime data ---
          anime.detectionSource = detectionSource;
          if (rssEpisodeUrl) anime.rssEpisodeUrl = rssEpisodeUrl;

          if (latestEpisode > anime.lastEpisode) {
            const diff = latestEpisode - anime.lastEpisode;

            if (anime.newEpisodes !== diff || anime.notifiedLatest !== latestEpisode) {
              console.log(`✨ NUEVO: ${anime.title}: Ep.${anime.lastEpisode} → Ep.${latestEpisode} (Diff: ${diff}) [${detectionSource}]`);
              if (anime.notifiedLatest !== latestEpisode) {
                await sendEpisodeNotification(anime, latestEpisode, detectionSource);
              }
              anime.newEpisodes = diff;
              anime.notifiedLatest = latestEpisode;
              updatesFound++;
            } else {
              console.log(`✓ Sin cambios: ${anime.title} (Ep.${anime.lastEpisode} + ${diff} nuevos) [${detectionSource}]`);
            }
          }
          anime.lastChecked = Date.now();

        } catch (error) {
          console.error(`Error verificando ${anime.title}:`, error);
        }
      });

      await Promise.all(batchPromises);
    }

    // Update AniList health status
    if (anilistErrorCount > followedAnimes.length / 2) {
      apiStatus.anilist = 'error';
    }

    // Save everything
    await chrome.storage.local.set({ followedAnimes, apiStatus });
    console.log(updatesFound > 0
      ? `🎉 ${updatesFound} nuevo(s) episodio(s) encontrado(s)! [RSS: ${apiStatus.rss}, AniList: ${apiStatus.anilist}]`
      : `✓ Verificación completada. Sin nuevos episodios. [RSS: ${apiStatus.rss}, AniList: ${apiStatus.anilist}]`);

  } catch (error) {
    console.error('Error en checkForNewEpisodes:', error);
  }
}

// ============================================
// ANIME TRACKING: FETCH LATEST EPISODE VIA ANILIST API
// ============================================

/**
 * Uses AniList GraphQL API (free, no auth required) to get the latest
 * episode count for an anime. Crunchyroll's SPA returns empty HTML
 * to service worker fetch(), so scraping doesn't work.
 */
/* Helper to query AniList */
async function queryAniList(searchTitle, format = null) {
  let query;
  let variables = { search: searchTitle };

  if (format) {
    query = `
      query ($search: String, $format: MediaFormat) {
        Media(search: $search, type: ANIME, status_in: [RELEASING, FINISHED], format: $format) {
          title { romaji english }
          episodes
          nextAiringEpisode { episode }
          status
          airingSchedule(notYetAired: false, perPage: 1) { nodes { episode } }
        }
      }`;
    variables.format = format;
  } else {
    query = `
      query ($search: String) {
        Media(search: $search, type: ANIME, status_in: [RELEASING, FINISHED]) {
          title { romaji english }
          episodes
          nextAiringEpisode { episode }
          status
          airingSchedule(notYetAired: false, perPage: 1) { nodes { episode } }
        }
      }`;
  }

  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`AniList API HTTP ${response.status}`);
    }

    const result = await response.json();
    return result?.data?.Media || null;
  } catch (error) {
    console.warn(`Query AniList error for "${searchTitle}":`, error);
    return null;
  }
}

/**
 * Uses AniList GraphQL API (free, no auth required) to get the latest
 * episode count for an anime.
 */
async function fetchLatestEpisode(animeUrl, animeTitle, currentLastEpisode = 0) {
  try {
    // Clean the title for search
    const searchTitle = cleanTitleForSearch(animeTitle || '');
    if (!searchTitle) {
      return 0;
    }

    console.log(`🔍 Buscando en AniList: "${searchTitle}" (Prioridad TV)`);
    let media = await queryAniList(searchTitle, 'TV');

    // If no TV show found with the long title, try short title (TV)
    if (!media && searchTitle.includes(':')) {
      const shortTitle = searchTitle.split(':')[0].trim();
      if (shortTitle.length >= 3) {
        console.log(`🔍 Reintentando búsqueda con título corto: "${shortTitle}" (TV)`);
        media = await queryAniList(shortTitle, 'TV');
      }
    }

    // If STILL no TV show, try broad search (any format)
    if (!media) {
      console.log(`🔍 Reintentando búsqueda general (cualquier formato) para "${searchTitle}"`);
      media = await queryAniList(searchTitle);
      // And fallback to short title broad search if needed
      if (!media && searchTitle.includes(':')) {
        const shortTitle = searchTitle.split(':')[0].trim();
        if (shortTitle.length >= 3) {
          media = await queryAniList(shortTitle);
        }
      }
    }

    let latestEpisode = 0;

    if (media) {
      console.log(`🔍 AniList resultado: "${media.title?.romaji || media.title?.english}"`,
        `| Status: ${media.status}`,
        `| Episodes: ${media.episodes || '?'}`,
        `| Next: Ep.${media.nextAiringEpisode?.episode || '?'}`);

      // Determine latest aired episode
      if (media.nextAiringEpisode?.episode) {
        latestEpisode = media.nextAiringEpisode.episode - 1;
      }
      else if (media.status === 'FINISHED' && media.episodes) {
        latestEpisode = media.episodes;
      }
      else if (media.airingSchedule?.nodes?.length > 0) {
        latestEpisode = media.airingSchedule.nodes[0].episode;
      }
      else if (media.episodes) {
        latestEpisode = media.episodes;
      }
    }

    console.log(`🔍 Último episodio final determinado: ${latestEpisode}`);
    return latestEpisode;

  } catch (error) {
    console.error('Error en fetchLatestEpisode:', error);
    return 0;
  }
}

/**
 * Cleans Crunchyroll title for AniList search.
 * Removes "Watch", language tags, extra text.
 */
function cleanTitleForSearch(title) {
  return title
    .replace(/^Watch\s+/i, '')             // Remove "Watch " prefix
    .replace(/\s*[-–—]\s*Crunchyroll.*$/i, '') // Remove " - Crunchyroll"
    .replace(/\s*\((?:Dub|Sub|English|Spanish|Español|Japanese|Latino).*?\)/gi, '') // Remove (Dub), (Sub), etc.
    .replace(/\s*(?:Dub|Sub)\s*$/i, '')    // Remove trailing Dub/Sub
    .replace(/\s*Season\s*\d+\s*$/i, '')   // Remove "Season N" for better search
    .replace(/[-–—]/g, ' ')                // Replace hyphens/dashes with spaces for better AniList matching
    .replace(/\s+/g, ' ')                  // Collapse multiple spaces into one
    .trim();
}

// ============================================
// ANIME TRACKING: NOTIFICATIONS
// ============================================

async function sendEpisodeNotification(anime, newEpisode, source = 'anilist') {
  const notificationId = `episode-${anime.id}-${newEpisode}-${Date.now()}`;
  const sourceLabel = source === 'rss' ? '🟢 Confirmado en Crunchyroll' : '🟡 Según AniList';

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: anime.thumbnail || chrome.runtime.getURL('icons/icono chrome.png'),
      title: '🎬 ¡Nuevo episodio disponible!',
      message: `${anime.title} — Episodio ${newEpisode} ya está en Crunchyroll`,
      contextMessage: sourceLabel,
      buttons: [
        { title: '▶️ Ver ahora' },
        { title: '⏰ Ver después' }
      ],
      requireInteraction: true,
      priority: 2
    });

    // Use RSS direct URL if available, otherwise fall back to anime page URL
    const watchUrl = (source === 'rss' && anime.rssEpisodeUrl) ? anime.rssEpisodeUrl : anime.url;

    await chrome.storage.local.set({
      [`notification_${notificationId}`]: {
        animeId: anime.id,
        animeTitle: anime.title,
        animeUrl: watchUrl,
        episodeNumber: newEpisode,
        source: source,
        timestamp: Date.now()
      }
    });

    console.log(`✅ Notificación enviada: ${anime.title} Ep.${newEpisode} [${source}]`);
  } catch (error) {
    console.error('Error enviando notificación:', error);
  }
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const data = await chrome.storage.local.get(`notification_${notificationId}`);
  const notifData = data[`notification_${notificationId}`];
  if (!notifData) return;

  if (buttonIndex === 0) {
    // "Ver ahora"
    await chrome.tabs.create({ url: notifData.animeUrl });
  }
  chrome.notifications.clear(notificationId);
  await chrome.storage.local.remove(`notification_${notificationId}`);
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const data = await chrome.storage.local.get(`notification_${notificationId}`);
  const notifData = data[`notification_${notificationId}`];
  if (notifData) {
    await chrome.tabs.create({ url: notifData.animeUrl });
  }
  chrome.notifications.clear(notificationId);
  await chrome.storage.local.remove(`notification_${notificationId}`);
});

chrome.notifications.onClosed.addListener(async (notificationId) => {
  await chrome.storage.local.remove(`notification_${notificationId}`);
});

// ============================================
// ANIME TRACKING: UTILITIES
// ============================================

function isQuietHours(settings) {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (settings.quietHoursStart || '22:00').split(':').map(Number);
  const [endH, endM] = (settings.quietHoursEnd || '08:00').split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Crosses midnight: 22:00 → 08:00
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }
  return currentTime >= startTime && currentTime < endTime;
}
