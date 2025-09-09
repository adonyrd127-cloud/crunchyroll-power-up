
// Popup script para Crunchy+ Plus v1.6.11 - i18n SUPPORT ADDED + Calendar Filter
console.log("🟠 Crunchy+ Plus Popup: Script loaded");

// i18n function to get localized messages
function getMessage(key) {
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key) || `__MSG_${key}__`;
        }
        return `__MSG_${key}__`;
    } catch (error) {
        console.warn("🟠 i18n getMessage error:", error);
        return `__MSG_${key}__`;
    }
}

// Function to replace all i18n placeholders in the document
function replaceI18nPlaceholders() {
    console.log("🌐 Replacing i18n placeholders...");
    
    // Set the correct language attribute
    let currentLocale = 'en';
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
            currentLocale = chrome.i18n.getUILanguage();
        } else {
            currentLocale = navigator.language || 'en';
        }
    } catch (error) {
        console.warn("🟠 i18n getUILanguage error:", error);
        currentLocale = navigator.language || 'en';
    }
    document.documentElement.lang = currentLocale.startsWith('es') ? 'es' : 'en';
    console.log("🌐 Language set to:", document.documentElement.lang, "based on locale:", currentLocale);
    
    // Get all text nodes and attributes that might contain __MSG_key__
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.includes('__MSG_')) {
            textNodes.push(node);
        }
    }
    
    // Replace text content
    textNodes.forEach(textNode => {
        textNode.nodeValue = textNode.nodeValue.replace(/__MSG_(\w+)__/g, (match, key) => {
            return getMessage(key);
        });
    });
    
    // Replace title attribute
    document.title = document.title.replace(/__MSG_(\w+)__/g, (match, key) => {
        return getMessage(key);
    });
    
    // Replace any other attributes that might contain i18n keys
    const elementsWithI18n = document.querySelectorAll('[title*="__MSG_"], [alt*="__MSG_"], [placeholder*="__MSG_"]');
    elementsWithI18n.forEach(element => {
        ['title', 'alt', 'placeholder'].forEach(attr => {
            if (element.hasAttribute(attr)) {
                const value = element.getAttribute(attr);
                if (value.includes('__MSG_')) {
                    element.setAttribute(attr, value.replace(/__MSG_(\w+)__/g, (match, key) => {
                        return getMessage(key);
                    }));
                }
            }
        });
    });
    
    console.log("🌐 i18n placeholders replaced");
}




let skipIntroCheckbox, skipRecapCheckbox, skipEndingCheckbox;
let theaterModeCheckbox, nextEpisodeDateCheckbox, calendarFilterCheckbox, miniPlayerCheckbox;


document.addEventListener('DOMContentLoaded', function() {
    console.log("🟠 Popup: DOM loaded, initializing...");
    
    // FIRST: Replace i18n placeholders
    replaceI18nPlaceholders();
    
    // Obtener referencias a los elementos
    skipIntroCheckbox = document.getElementById('skipIntro');
    skipRecapCheckbox = document.getElementById('skipRecap');
    skipEndingCheckbox = document.getElementById('skipEnding');
    theaterModeCheckbox = document.getElementById('theaterMode');
    nextEpisodeDateCheckbox = document.getElementById('nextEpisodeDate');
    calendarFilterCheckbox = document.getElementById('calendarFilter');
    miniPlayerCheckbox = document.getElementById('miniPlayer');
    
    
    loadConfiguration();
    
    
    setupEventListeners();
    
    console.log("🟠 Popup: Initialization complete");
});


function loadConfiguration() {
    console.log("🟠 Popup: Loading configuration...");
    
    chrome.storage.sync.get(null, function(result) {
        console.log("🟠 Popup: Configuration loaded:", result);
        
        skipIntroCheckbox.checked = result.skip_event_intro === 1;
        skipRecapCheckbox.checked = result.skip_event_recap === 1;
        skipEndingCheckbox.checked = result.skip_event_ending === 1;
        
        theaterModeCheckbox.checked = result.theaterMode;
        nextEpisodeDateCheckbox.checked = result.nextEpisodeDate;
        calendarFilterCheckbox.checked = result.calendarFilter;
        miniPlayerCheckbox.checked = result.miniPlayerEnabled;
        
        console.log("🟠 Popup: Checkboxes configured");
    });
}


function setupEventListeners() {
    console.log("🟠 Popup: Setting up event listeners...");
    
    // CORREGIDO: Skip checkboxes con lógica correcta
    skipIntroCheckbox.addEventListener('change', function() {
        // CORREGIDO: checkbox marcado = 1 (auto skip), desmarcado = 0 (manual)
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_intro', value);
        console.log("🟠 Popup: Skip Intro changed to:", value, this.checked ? "(AUTO SKIP)" : "(MANUAL MODE)");
    });
    
    skipRecapCheckbox.addEventListener('change', function() {
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_recap', value);
        console.log("🟠 Popup: Skip Recap changed to:", value, this.checked ? "(AUTO SKIP)" : "(MANUAL MODE)");
    });
    
    skipEndingCheckbox.addEventListener('change', function() {
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_ending', value);
        console.log("🟠 Popup: Skip Ending changed to:", value, this.checked ? "(AUTO SKIP)" : "(MANUAL MODE)");
    });
    
    // Other checkboxes
    theaterModeCheckbox.addEventListener('change', function() {
        saveConfig('theaterMode', this.checked);
        console.log("🟠 Popup: Theater Mode changed to:", this.checked);
    });
    
    nextEpisodeDateCheckbox.addEventListener('change', function() {
        saveConfig('nextEpisodeDate', this.checked);
        console.log("🟠 Popup: Next Episode Date changed to:", this.checked);
    });
    
    // NEW: Calendar Filter checkbox
    calendarFilterCheckbox.addEventListener('change', function() {
        saveConfig('calendarFilter', this.checked);
        console.log("🔍 Popup: Calendar Filter changed to:", this.checked);
    });
    
    // NEW: Mini Player checkbox
    miniPlayerCheckbox.addEventListener('change', function() {
        saveConfig('miniPlayerEnabled', this.checked);
        console.log("📺 Popup: Mini Player changed to:", this.checked);
        
        // Enviar mensaje a content script para actualizar estado
        chrome.runtime.sendMessage({
            type: 'MINI_PLAYER_TOGGLE',
            enabled: this.checked
        });
    });
    
    console.log("🟠 Popup: Event listeners configured");
    
    initializeUIState();
}


function saveConfig(key, value) {
    const config = {};
    config[key] = value;
    
    chrome.storage.sync.set(config, function() {
        console.log("🟠 Popup: Config saved:", key, "=", value);
        
    });
}




function updatePillButton(pill, checkbox) {
    if (checkbox.checked) {
        pill.classList.add('active');
    } else {
        pill.classList.remove('active');
    }
}

function updateSwitch(switchEl, checkbox) {
    if (checkbox.checked) {
        switchEl.classList.add('active');
    } else {
        switchEl.classList.remove('active');
    }
}

function initializeUIState() {
    // Get pill button elements
    const introPill = document.getElementById('intro-pill');
    const recapPill = document.getElementById('recap-pill');
    const endingPill = document.getElementById('ending-pill');
    
    // Get switch elements
    const theaterSwitch = document.getElementById('theater-switch');
    const episodeSwitch = document.getElementById('episode-switch');
    const calendarFilterSwitch = document.getElementById('calendar-filter-switch');
    const miniPlayerSwitch = document.getElementById('mini-player-switch');
    
    // Add event listeners for UI updates
    if (skipIntroCheckbox) {
        skipIntroCheckbox.addEventListener('change', () => updatePillButton(introPill, skipIntroCheckbox));
    }
    if (skipRecapCheckbox) {
        skipRecapCheckbox.addEventListener('change', () => updatePillButton(recapPill, skipRecapCheckbox));
    }
    if (skipEndingCheckbox) {
        skipEndingCheckbox.addEventListener('change', () => updatePillButton(endingPill, skipEndingCheckbox));
    }
    if (theaterModeCheckbox) {
        theaterModeCheckbox.addEventListener('change', () => updateSwitch(theaterSwitch, theaterModeCheckbox));
    }
    if (nextEpisodeDateCheckbox) {
        nextEpisodeDateCheckbox.addEventListener('change', () => updateSwitch(episodeSwitch, nextEpisodeDateCheckbox));
    }
    if (calendarFilterCheckbox) {
        calendarFilterCheckbox.addEventListener('change', () => updateSwitch(calendarFilterSwitch, calendarFilterCheckbox));
    }
    if (miniPlayerCheckbox) {
        miniPlayerCheckbox.addEventListener('change', () => updateSwitch(miniPlayerSwitch, miniPlayerCheckbox));
    }
    
    // Initialize visual state after configuration is loaded
    setTimeout(() => {
        if (introPill && skipIntroCheckbox) updatePillButton(introPill, skipIntroCheckbox);
        if (recapPill && skipRecapCheckbox) updatePillButton(recapPill, skipRecapCheckbox);
        if (endingPill && skipEndingCheckbox) updatePillButton(endingPill, skipEndingCheckbox);
        if (theaterSwitch && theaterModeCheckbox) updateSwitch(theaterSwitch, theaterModeCheckbox);
        if (episodeSwitch && nextEpisodeDateCheckbox) updateSwitch(episodeSwitch, nextEpisodeDateCheckbox);
        if (calendarFilterSwitch && calendarFilterCheckbox) updateSwitch(calendarFilterSwitch, calendarFilterCheckbox);
        if (miniPlayerSwitch && miniPlayerCheckbox) updateSwitch(miniPlayerSwitch, miniPlayerCheckbox);
    }, 100);
}


