// Extensión Crunchyroll Power Up - Script de Fondo
// Author: Ing. Adony R.

// Configuración predeterminada compatible con el formato del repositorio original
const defaultSettings = {
  // Configuración de salto (mapeada al formato original)
  skip_event_intro: 1,        // 0=hidden, 1=visible, 2=auto-skip
  skip_event_ending: 1,       // 0=hidden, 1=visible, 2=auto-skip
  skip_event_recap: 1,        // 0=hidden, 1=visible, 2=auto-skip
  auto_skip: 0,               // General auto-skip setting
  hide_skip_button: 0,        // Hide skip buttons
  
  // Nuestra configuración de interfaz de usuario (mantener compatibilidad)
  autoSkipIntro: true,
  autoSkipRecap: true,
  autoSkipOutro: false,
  autoSkipEnding: false,
  enhancedPlayer: true,
  customTheme: 'dark',
  theaterMode: true,
  forceVideoQuality: true,
  selectedQuality: '1080p',
  videoQuality: '1080p',
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
  nextEpisodeDate: true,
  miniPlayerEnabled: true,  // Mini Player enabled by default
  
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
    
    // Fusionar con valores predeterminados (no sobrescribir la configuración existente)
    const mergedSettings = { ...defaultSettings, ...existingSettings };
    
    // Mapear nuestra configuración de interfaz de usuario al formato del repositorio original
    mergedSettings.skip_event_intro = mergedSettings.autoSkipIntro ? 2 : 1;
    mergedSettings.skip_event_recap = mergedSettings.autoSkipRecap ? 2 : 1;
    mergedSettings.skip_event_ending = mergedSettings.autoSkipEnding ? 2 : 1;
    mergedSettings.auto_skip = mergedSettings.autoSkipIntro || mergedSettings.autoSkipRecap || mergedSettings.autoSkipEnding ? 2 : 1;
    mergedSettings.hide_skip_button = 0; // Siempre mostrar botones
    
    // Guardar configuración fusionada
    await chrome.storage.sync.set(mergedSettings);
  console.log('Crunchyroll Power Up: Configuración inicializada:', mergedSettings);
  } catch (error) {
    console.error('Crunchyroll Power Up: Error al inicializar la configuración:', error);
  }
});

// Escuchar cambios de configuración y sincronizar entre formatos
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync') {
  console.log('Crunchyroll Power Up: La configuración cambió:', changes);
    
    try {
      const currentSettings = await chrome.storage.sync.get(null);
      let needsUpdate = false;
      const updates = {};
      
      // Sincronizar nuestra configuración de interfaz de usuario al formato original
      if (changes.autoSkipIntro) {
        updates.skip_event_intro = changes.autoSkipIntro.newValue ? 2 : 1;
        needsUpdate = true;
      }
      
      if (changes.autoSkipRecap) {
        updates.skip_event_recap = changes.autoSkipRecap.newValue ? 2 : 1;
        needsUpdate = true;
      }
      
      if (changes.autoSkipEnding) {
        updates.skip_event_ending = changes.autoSkipEnding.newValue ? 2 : 1;
        needsUpdate = true;
      }
      
      if (changes.autoSkipOutro) {
        updates.skip_event_ending = changes.autoSkipOutro.newValue ? 2 : 1;
        needsUpdate = true;
      }
      
      // Actualizar auto_skip basado en cualquier configuración de salto
      if (changes.autoSkipIntro || changes.autoSkipEnding || changes.autoSkipOutro) {
        const hasAnyAutoSkip = currentSettings.autoSkipIntro || 
                              currentSettings.autoSkipEnding || 
                              currentSettings.autoSkipOutro;
        updates.auto_skip = hasAnyAutoSkip ? 2 : 1;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await chrome.storage.sync.set(updates);
        console.log('Crunchyroll Power Up: Configuración sincronizada al formato original:', updates);
      }
    } catch (error) {
      console.error('Crunchyroll Power Up: Error al sincronizar la configuración:', error);
    }
  }
});

// Manejar mensajes de los scripts de contenido
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Crunchyroll Power Up: Mensaje recibido:', message);
  
  switch (message.type) {
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
