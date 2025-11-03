// Script del popup para Crunchy+ Plus v1.6.32 - soporte i18n + Filtro de calendario
console.log("Crunchyroll Power Up Popup: Script cargado");

// Función i18n para obtener mensajes localizados
function getMessage(key) {
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key) || `__MSG_${key}__`;
        }
        return `__MSG_${key}__`;
    } catch (error) {
        console.warn("🟠 Error en i18n.getMessage:", error);
        return `__MSG_${key}__`;
    }
}

// Función para reemplazar marcadores i18n en el documento
function replaceI18nPlaceholders() {
    console.log("🌐 Reemplazando marcadores i18n...");
    
    // Set the correct language attribute
    let currentLocale = 'en';
    try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
            currentLocale = chrome.i18n.getUILanguage();
        } else {
            currentLocale = navigator.language || 'en';
        }
    } catch (error) {
        console.warn("🟠 Error en i18n.getUILanguage:", error);
        currentLocale = navigator.language || 'en';
    }
    document.documentElement.lang = currentLocale.startsWith('es') ? 'es' : 'en';
    console.log("🌐 Idioma establecido en:", document.documentElement.lang, "basado en la configuración regional:", currentLocale);
    
    // Obtener todos los nodos de texto y atributos que puedan contener __MSG_key__
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
    
    // Reemplazar contenido de texto
    textNodes.forEach(textNode => {
        textNode.nodeValue = textNode.nodeValue.replace(/__MSG_(\w+)__/g, (match, key) => {
            return getMessage(key);
        });
    });
    
    // Reemplazar atributo title
    document.title = document.title.replace(/__MSG_(\w+)__/g, (match, key) => {
        return getMessage(key);
    });
    
    // Reemplazar otros atributos que puedan contener claves i18n
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
    
    console.log("🌐 Marcadores i18n reemplazados");
}

// Configuración por defecto simple - CORREGIDA + Calendar Filter + Mini Player
const DEFAULT_CONFIG = {
    skip_event_intro: 0,    // Desmarcado por defecto = Modo Manual
    skip_event_recap: 0,    // Desmarcado por defecto = Modo Manual  
    skip_event_ending: 0,   // Desmarcado por defecto = Modo Manual
    theaterMode: false,     // Deshabilitado por defecto
    nextEpisodeDate: true,  // Habilitado por defecto
    calendarFilter: false,  // Deshabilitado por defecto
    miniPlayerEnabled: false, // Deshabilitado por defecto
    anilistInfo: false // Deshabilitado por defecto
};

// Elementos del DOM
let skipIntroCheckbox, skipRecapCheckbox, skipEndingCheckbox;
let theaterModeCheckbox, nextEpisodeDateCheckbox, calendarFilterCheckbox, miniPlayerCheckbox, anilistInfoCheckbox;

// Inicializar popup
document.addEventListener('DOMContentLoaded', function() {
    console.log("🟠 Popup: DOM cargado, inicializando...");
    
    // PRIMERO: Reemplazar marcadores i18n
    replaceI18nPlaceholders();
    
    // Obtener referencias a los elementos
    skipIntroCheckbox = document.getElementById('skipIntro');
    skipRecapCheckbox = document.getElementById('skipRecap');
    skipEndingCheckbox = document.getElementById('skipEnding');
    theaterModeCheckbox = document.getElementById('theaterMode');
    nextEpisodeDateCheckbox = document.getElementById('nextEpisodeDate');
    calendarFilterCheckbox = document.getElementById('calendarFilter');
    miniPlayerCheckbox = document.getElementById('miniPlayer');
    anilistInfoCheckbox = document.getElementById('anilistInfo');
    
    // Cargar configuración guardada
    loadConfiguration();
    
    // Agregar event listeners
    setupEventListeners();
    
    console.log("🟠 Popup: Inicialización completa");
});

// Cargar configuración desde storage
function loadConfiguration() {
    console.log("🟠 Popup: Cargando configuración...");
    
    chrome.storage.sync.get(DEFAULT_CONFIG, function(result) {
        console.log("🟠 Popup: Configuración cargada:", result);
        
        // CORREGIDO: Para skip - checkbox marcado = auto skip (valor 1)
        skipIntroCheckbox.checked = result.skip_event_intro === 1;
        skipRecapCheckbox.checked = result.skip_event_recap === 1;
        skipEndingCheckbox.checked = result.skip_event_ending === 1;
        
        // Para otras opciones: usar valor booleano directo
        theaterModeCheckbox.checked = result.theaterMode;
        nextEpisodeDateCheckbox.checked = result.nextEpisodeDate;
        calendarFilterCheckbox.checked = result.calendarFilter;
        miniPlayerCheckbox.checked = result.miniPlayerEnabled;
        anilistInfoCheckbox.checked = result.anilistInfo;
        
    console.log("🟠 Popup: Checkboxes configurados");
    console.log("🟠 ✅ LÓGICA CORREGIDA:");
    console.log("🟠 Marcado = Salto automático (valor 1)");
    console.log("🟠 Desmarcado = Modo manual (valor 0)");
    console.log("🔍 Filtro de Calendario:", result.calendarFilter ? "HABILITADO" : "DESHABILITADO");
    });
}

// Configurar event listeners
function setupEventListeners() {
    console.log("🟠 Popup: Configurando listeners de eventos...");
    
    // CORREGIDO: Skip checkboxes con lógica correcta
    skipIntroCheckbox.addEventListener('change', function() {
        // CORREGIDO: checkbox marcado = 1 (auto skip), desmarcado = 0 (manual)
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_intro', value);
    console.log("🟠 Popup: Skip Intro cambiado a:", value, this.checked ? "(SALTO AUTOMÁTICO)" : "(MODO MANUAL)");
    });
    
    skipRecapCheckbox.addEventListener('change', function() {
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_recap', value);
    console.log("🟠 Popup: Skip Recap cambiado a:", value, this.checked ? "(SALTO AUTOMÁTICO)" : "(MODO MANUAL)");
    });
    
    skipEndingCheckbox.addEventListener('change', function() {
        const value = this.checked ? 1 : 0;
        saveConfig('skip_event_ending', value);
    console.log("🟠 Popup: Skip Ending cambiado a:", value, this.checked ? "(SALTO AUTOMÁTICO)" : "(MODO MANUAL)");
    });
    
    // Otras casillas
    theaterModeCheckbox.addEventListener('change', function() {
        saveConfig('theaterMode', this.checked);
        console.log("🟠 Popup: Theater Mode cambiado a:", this.checked);
    });
    
    nextEpisodeDateCheckbox.addEventListener('change', function() {
        saveConfig('nextEpisodeDate', this.checked);
        console.log("🟠 Popup: Next Episode Date cambiado a:", this.checked);
    });
    
    // NEW: Calendar Filter checkbox
    calendarFilterCheckbox.addEventListener('change', function() {
    saveConfig('calendarFilter', this.checked);
    console.log("🔍 Popup: Filtro de Calendario cambiado a:", this.checked);
    });
    
    // NEW: Mini Player checkbox
    miniPlayerCheckbox.addEventListener('change', function() {
    saveConfig('miniPlayerEnabled', this.checked);
    console.log("📺 Popup: Mini Reproductor cambiado a:", this.checked);
        
        // Enviar mensaje a content script para actualizar estado
        chrome.runtime.sendMessage({
            type: 'MINI_PLAYER_TOGGLE',
            enabled: this.checked
        });
    });

    anilistInfoCheckbox.addEventListener('change', function() {
        saveConfig('anilistInfo', this.checked);
        console.log("🟠 Popup: Anilist Info cambiado a:", this.checked);
    });
    
    console.log("🟠 Popup: Event listeners configurados");
    
    // Initialize UI visual state
    initializeUIState();
}

// Guardar configuración
function saveConfig(key, value) {
    const config = {};
    config[key] = value;
    
        chrome.storage.sync.set(config, function() {
        console.log("🟠 Popup: Config guardada:", key, "=", value);
        if (key.includes('skip_event_')) {
            console.log("🟠", value === 1 ? "✅ SALTO AUTOMÁTICO activado" : "🔧 MODO MANUAL activado");
        }
        if (key === 'calendarFilter') {
            console.log("🔍", value ? "✅ FILTRO DE CALENDARIO activado" : "🔧 FILTRO DE CALENDARIO desactivado");
        }
    });
}

// Función de depuración disponible en la consola del popup
window.crunchyPlusPopupDebug = function() {
    console.log("🔍 DEPURANDO CONFIGURACIÓN DEL POPUP");
    
    chrome.storage.sync.get(null, function(result) {
        console.log("📊 Almacenamiento completo:", result);
        
        Object.keys(result).forEach(key => {
            if (key.includes('skip_event_')) {
                const value = result[key];
                const mode = value === 1 ? "SALTO AUTOMÁTICO" : value === 0 ? "MODO MANUAL" : "DESCONOCIDO";
                console.log(`🔧 ${key}: ${value} (${mode})`);
            }
        });
    });
    
    return {
        skipIntro: skipIntroCheckbox?.checked,
        skipRecap: skipRecapCheckbox?.checked,
        skipEnding: skipEndingCheckbox?.checked,
        theaterMode: theaterModeCheckbox?.checked,
        nextEpisodeDate: nextEpisodeDateCheckbox?.checked,
        calendarFilter: calendarFilterCheckbox?.checked,
        miniPlayer: miniPlayerCheckbox?.checked
    };
};

// Funciones para actualizar la UI de elementos visuales (movidas desde script inline)
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

// Initialize UI visual state
function initializeUIState() {
    // Obtener elementos de tipo 'pill' (botones)
    const introPill = document.getElementById('intro-pill');
    const recapPill = document.getElementById('recap-pill');
    const endingPill = document.getElementById('ending-pill');
    
    // Obtener elementos tipo switch
    const theaterSwitch = document.getElementById('theater-switch');
    const episodeSwitch = document.getElementById('episode-switch');
    const calendarFilterSwitch = document.getElementById('calendar-filter-switch');
    const miniPlayerSwitch = document.getElementById('mini-player-switch');
    const anilistInfoSwitch = document.getElementById('anilist-info-switch');
    
    // Añadir listeners para actualizar la UI
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
    if (anilistInfoCheckbox) {
        anilistInfoCheckbox.addEventListener('change', () => updateSwitch(anilistInfoSwitch, anilistInfoCheckbox));
    }
    
    // Inicializar el estado visual una vez cargada la configuración
    setTimeout(() => {
        if (introPill && skipIntroCheckbox) updatePillButton(introPill, skipIntroCheckbox);
        if (recapPill && skipRecapCheckbox) updatePillButton(recapPill, skipRecapCheckbox);
        if (endingPill && skipEndingCheckbox) updatePillButton(endingPill, skipEndingCheckbox);
        if (theaterSwitch && theaterModeCheckbox) updateSwitch(theaterSwitch, theaterModeCheckbox);
        if (episodeSwitch && nextEpisodeDateCheckbox) updateSwitch(episodeSwitch, nextEpisodeDateCheckbox);
        if (calendarFilterSwitch && calendarFilterCheckbox) updateSwitch(calendarFilterSwitch, calendarFilterCheckbox);
        if (miniPlayerSwitch && miniPlayerCheckbox) updateSwitch(miniPlayerSwitch, miniPlayerCheckbox);
        if (anilistInfoSwitch && anilistInfoCheckbox) updateSwitch(anilistInfoSwitch, anilistInfoCheckbox);
    }, 100);
}

console.log("Crunchyroll Power Up Popup: Script cargado con LÓGICA CORREGIDA + Calendar Filter");
