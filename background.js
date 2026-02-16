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
