// Crunchyroll Power Up Extension - Background Script
// Author: Ing. Adony R.

// Default settings compatible with the original repository format
const defaultSettings = {
  // Skip settings (mapped to original format)
  skip_event_intro: 1,        // 0=hidden, 1=visible, 2=auto-skip
  skip_event_ending: 1,       // 0=hidden, 1=visible, 2=auto-skip
  skip_event_recap: 1,        // 0=hidden, 1=visible, 2=auto-skip
  auto_skip: 0,               // General auto-skip setting
  hide_skip_button: 0,        // Hide skip buttons
  
  // Our UI settings (maintain compatibility)
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
  
  // New features
  communityRatings: true,
  seasonProgress: true,
  nextEpisodeDate: true,
  miniPlayerEnabled: true,  // Mini Player enabled by default
  
  // Player settings
  player_auto_fullscreen: false,
  player_auto_theater: true,
  player_auto_next: true,
  player_speed_controls: true,
  player_quality_controls: true,
  
  // UI settings
  ui_hide_comments: false,
  ui_hide_related: false,
  ui_compact_mode: false
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🟠 Crunchyroll Power Up: Background script installed');
  
  try {
    // Get existing settings
    const existingSettings = await chrome.storage.sync.get(null);
    
    // Merge with defaults (don't overwrite existing settings)
    const mergedSettings = { ...defaultSettings, ...existingSettings };
    
    // Map our UI settings to the original repository format
    mergedSettings.skip_event_intro = mergedSettings.autoSkipIntro ? 2 : 1;
    mergedSettings.skip_event_recap = mergedSettings.autoSkipRecap ? 2 : 1;
    mergedSettings.skip_event_ending = mergedSettings.autoSkipEnding ? 2 : 1;
    mergedSettings.auto_skip = mergedSettings.autoSkipIntro || mergedSettings.autoSkipRecap || mergedSettings.autoSkipEnding ? 2 : 1;
    mergedSettings.hide_skip_button = 0; // Always show buttons
    
    // Save merged settings
    await chrome.storage.sync.set(mergedSettings);
    console.log('🟠 Crunchyroll Power Up: Settings initialized:', mergedSettings);
  } catch (error) {
    console.error('🟠 Crunchyroll Power Up: Error initializing settings:', error);
  }
});

// Listen for settings changes and sync between formats
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync') {
    console.log('🟠 Crunchyroll Power Up: Settings changed:', changes);
    
    try {
      const currentSettings = await chrome.storage.sync.get(null);
      let needsUpdate = false;
      const updates = {};
      
      // Sync our UI settings to original format
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
      
      // Update auto_skip based on any skip setting
      if (changes.autoSkipIntro || changes.autoSkipEnding || changes.autoSkipOutro) {
        const hasAnyAutoSkip = currentSettings.autoSkipIntro || 
                              currentSettings.autoSkipEnding || 
                              currentSettings.autoSkipOutro;
        updates.auto_skip = hasAnyAutoSkip ? 2 : 1;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await chrome.storage.sync.set(updates);
        console.log('🟠 Crunchyroll Power Up: Synced settings to original format:', updates);
      }
    } catch (error) {
      console.error('🟠 Crunchyroll Power Up: Error syncing settings:', error);
    }
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('🟠 Crunchyroll Power Up: Message received:', message);
  
  switch (message.type) {
    case 'getSettings':
      chrome.storage.sync.get(null).then(settings => {
        sendResponse({ success: true, settings });
      }).catch(error => {
        console.error('🟠 Crunchyroll Power Up: Error getting settings:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
      
    case 'updateSettings':
      chrome.storage.sync.set(message.settings).then(() => {
        console.log('🟠 Crunchyroll Power Up: Settings updated successfully');
        sendResponse({ success: true });
      }).catch(error => {
        console.error('🟠 Crunchyroll Power Up: Error updating settings:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
      
    case 'skipActive':
      // Forward skip command to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'skipActive' });
        }
      });
      sendResponse({ success: true });
      break;
      
    case 'MINI_PLAYER_TOGGLE':
      // Handle Mini Player toggle
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
      // Handle AniList API requests
      const { query } = message.data;
      console.log('🟠 Crunchyroll Power Up: AniList API request:', query);
      
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
      .then((response) => response.json())
      .then((json) => {
        console.log('🟠 Crunchyroll Power Up: AniList API response:', json);
        sendResponse(json);
      })
      .catch((error) => {
        console.error('🟠 Crunchyroll Power Up: AniList API error:', error);
        sendResponse({ error: error.message });
      });
      return true; // Keep message channel open for async response
      
    default:
      console.log('🟠 Crunchyroll Power Up: Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log('🟠 Crunchyroll Power Up: Extension icon clicked');
  // The popup will handle this automatically
});

// Handle tab updates (for SPA navigation detection)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.includes('crunchyroll.com') || tab.url.includes('beta.crunchyroll.com'))) {
    console.log('🟠 Crunchyroll Power Up: Crunchyroll page loaded:', tab.url);
    
    // Send message to content script to reinitialize if needed
    chrome.tabs.sendMessage(tabId, { type: 'pageLoaded', url: tab.url }).catch(() => {
      // Content script might not be ready yet, ignore error
    });
  }
});

console.log('🟠 Crunchyroll Power Up: Background script loaded successfully');
