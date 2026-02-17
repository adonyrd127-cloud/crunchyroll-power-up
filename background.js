// Extensión Crunchyroll Power Up - Script de Fondo
// Author: Ing. Adony R.

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

// Escuchar cambios de configuración
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('Crunchyroll Power Up: La configuración cambió:', changes);
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
    const storage = await chrome.storage.sync.get(['followedAnimes', 'notificationSettings']);
    const followedAnimes = storage.followedAnimes || [];
    const settings = storage.notificationSettings || {};

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

    console.log(`🔍 Verificando ${followedAnimes.length} anime(s)...`);
    let updatesFound = 0;

    for (const anime of followedAnimes) {
      try {
        const latestEpisode = await fetchLatestEpisode(anime.url, anime.title);

        if (latestEpisode > anime.lastEpisode) {
          console.log(`✨ NUEVO: ${anime.title}: Ep.${anime.lastEpisode} → Ep.${latestEpisode}`);
          await sendEpisodeNotification(anime, latestEpisode);
          anime.lastEpisode = latestEpisode;
          updatesFound++;
        } else {
          console.log(`✓ Sin cambios: ${anime.title} (Ep.${anime.lastEpisode})`);
        }
        anime.lastChecked = Date.now();

      } catch (error) {
        console.error(`Error verificando ${anime.title}:`, error);
      }
    }

    await chrome.storage.sync.set({ followedAnimes });
    console.log(updatesFound > 0
      ? `🎉 ${updatesFound} nuevo(s) episodio(s) encontrado(s)!`
      : '✓ Verificación completada. Sin nuevos episodios.');

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
async function fetchLatestEpisode(animeUrl, animeTitle) {
  try {
    // Clean the title for search
    const searchTitle = cleanTitleForSearch(animeTitle || '');
    if (!searchTitle) {
      console.warn('🔍 No se pudo limpiar el título para búsqueda');
      return 0;
    }

    console.log(`🔍 Buscando en AniList: "${searchTitle}"`);

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME, status_in: [RELEASING, FINISHED]) {
          title {
            romaji
            english
          }
          episodes
          nextAiringEpisode {
            episode
            airingAt
          }
          status
          airingSchedule(notYetAired: false, perPage: 1) {
            nodes {
              episode
            }
          }
        }
      }
    `;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { search: searchTitle }
      })
    });

    if (!response.ok) throw new Error(`AniList API HTTP ${response.status}`);

    const result = await response.json();
    const media = result?.data?.Media;

    if (!media) {
      console.warn(`🔍 AniList: No se encontró "${searchTitle}"`);
      return 0;
    }

    console.log(`🔍 AniList resultado: "${media.title?.romaji || media.title?.english}"`,
      `| Status: ${media.status}`,
      `| Episodes: ${media.episodes || '?'}`,
      `| Next: Ep.${media.nextAiringEpisode?.episode || '?'}`);

    // Determine latest aired episode
    let latestEpisode = 0;

    // If there's a next airing episode, the latest aired is episode - 1
    if (media.nextAiringEpisode?.episode) {
      latestEpisode = media.nextAiringEpisode.episode - 1;
    }
    // If the show is FINISHED, use total episodes
    else if (media.status === 'FINISHED' && media.episodes) {
      latestEpisode = media.episodes;
    }
    // Try airing schedule
    else if (media.airingSchedule?.nodes?.length > 0) {
      latestEpisode = media.airingSchedule.nodes[0].episode;
    }
    // Fallback to total episodes
    else if (media.episodes) {
      latestEpisode = media.episodes;
    }

    console.log(`🔍 Último episodio determinado: ${latestEpisode}`);
    return latestEpisode;

  } catch (error) {
    console.error('Error en fetchLatestEpisode (AniList):', error);
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
    .replace(/\s*\((?:Dub|Sub|English|Spanish|Español|Japanese).*?\)/gi, '') // Remove (Dub), (Sub), etc.
    .replace(/\s*(?:Dub|Sub)\s*$/i, '')    // Remove trailing Dub/Sub
    .replace(/\s*Season\s*\d+\s*$/i, '')   // Remove "Season N" for better search
    .trim();
}

// ============================================
// ANIME TRACKING: NOTIFICATIONS
// ============================================

async function sendEpisodeNotification(anime, newEpisode) {
  const notificationId = `episode-${anime.id}-${newEpisode}-${Date.now()}`;

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: anime.thumbnail || chrome.runtime.getURL('icons/icono chrome.png'),
      title: '🆕 ¡Nuevo episodio disponible!',
      message: `${anime.title} — Episodio ${newEpisode}`,
      contextMessage: 'Crunchyroll Power Up',
      buttons: [
        { title: '▶️ Ver ahora' },
        { title: '⏰ Ver después' }
      ],
      requireInteraction: true,
      priority: 2
    });

    await chrome.storage.local.set({
      [`notification_${notificationId}`]: {
        animeId: anime.id,
        animeTitle: anime.title,
        animeUrl: anime.url,
        episodeNumber: newEpisode,
        timestamp: Date.now()
      }
    });

    console.log(`✅ Notificación enviada: ${anime.title} Ep.${newEpisode}`);
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
