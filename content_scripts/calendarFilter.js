// Crunchyroll Power Up Calendar Filter v1.6.32
// Sistema de filtrado avanzado para el calendario de estrenos de Crunchyroll


console.log("🔍 Crunchyroll Power Up: Filtro de Calendario cargado");

// Feature flags
const SHOW_HIDDEN_COUNT = false; // Hide counters in production

// LocalStorage keys for persistence
const LS_PANEL_STATE = 'cr_calendar_filters_panel_open';
const LS_FILTERS_STATE = 'cr_calendar_filters_state';

// Persistence helper functions
function savePanelState(isOpen) {
    try {
        localStorage.setItem(LS_PANEL_STATE, JSON.stringify(isOpen));
    } catch (e) {
        console.warn("🔍 Filtro de Calendario: Error al guardar el estado del panel", e);
    }
}

function loadPanelState() {
    try {
        const saved = localStorage.getItem(LS_PANEL_STATE);
        return saved !== null ? JSON.parse(saved) : true; // Default to open
    } catch (e) {
        console.warn("🔍 Filtro de Calendario: Error al cargar el estado del panel", e);
        return true;
    }
}

function saveFiltersState(filters) {
    try {
        localStorage.setItem(LS_FILTERS_STATE, JSON.stringify(filters));
    } catch (e) {
        console.warn("🔍 Filtro de Calendario: Error al guardar el estado de filtros", e);
    }
}

function loadFiltersState() {
    try {
        const saved = localStorage.getItem(LS_FILTERS_STATE);
        return saved !== null ? JSON.parse(saved) : null;
    } catch (e) {
        console.warn("🔍 Filtro de Calendario: Error al cargar el estado de filtros", e);
        return null;
    }
}

function clearPersistedState() {
    try {
        localStorage.removeItem(LS_PANEL_STATE);
        localStorage.removeItem(LS_FILTERS_STATE);
        console.log("🔍 Filtro de Calendario: Estado persistido borrado");
    } catch (e) {
        console.warn("🔍 Filtro de Calendario: Error al borrar el estado persistido", e);
    }
}

class CrunchyrollPowerUpCalendarFilter {
    constructor() {
        this.isEnabled = false;
        this.filters = {
            dubbed: 'show', // 'only', 'show', 'hide'
            languages: {
                english: true,
                spanish: true,
                french: true,
                german: true,
                others: true
            },
            inQueue: 'show', // 'only', 'show', 'hide'
            premiere: 'show' // 'only', 'show', 'hide'
        };
        this.hiddenCounts = {};
        this.filterUI = null;
        
        // Cargar estado persistido temprano para prevenir parpadeos
        this.isCollapsed = !loadPanelState(); // Panel state is inverted (true = open)
        const savedFilters = loadFiltersState();
        if (savedFilters) {
            this.filters = { ...this.filters, ...savedFilters };
            console.log("🔍 Filtro de Calendario: Filtros persistidos cargados", this.filters);
        }
        
        // Constantes de idiomas (heredadas del repositorio original)
        this.ALL_DUB_LANGUAGES = [
            "Arabic", "Castilian", "Catalan", "English", "English-IN",
            "European-Portuguese", "French", "German", "Hindi", "Italian",
            "Mandarin", "Polish", "Portuguese", "Russian", "Spanish",
            "Tamil", "Thai"
        ];
        
        this.DEFAULT_DUB_LANGUAGES = ["English", "Spanish", "French", "German"];
        
        this.init();
    }
    
    async init() {
        console.log("🔍 Filtro de Calendario: Inicializando...");
        
        // Check if we're on the calendar page
        if (!this.isCalendarPage()) {
            console.log("🔍 Filtro de Calendario: No es la página de calendario, se omite");
            return;
        }
        
        // Load settings
        await this.loadSettings();
        
        if (!this.isEnabled) {
            console.log("🔍 Filtro de Calendario: Deshabilitado en la configuración");
            return;
        }
        
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    isCalendarPage() {
        const isCalendar = window.location.pathname.includes('simulcastcalendar') || 
               window.location.pathname.includes('calendar') ||
               document.querySelector('[data-testid="simulcast-calendar"]') ||
               document.querySelector('.simulcast-calendar') ||
               document.title.toLowerCase().includes('calendar');
        
        console.log("🔍 Filtro de Calendario: Comprobación de página de calendario:", isCalendar, window.location.pathname);
        return isCalendar;
    }
    
    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get({
                calendarFilter: false,
                calendarFilterSettings: this.filters
            }, (result) => {
                this.isEnabled = result.calendarFilter;
                this.filters = { ...this.filters, ...result.calendarFilterSettings };
                console.log("🔍 Filtro de Calendario: Configuración cargada", { enabled: this.isEnabled, filters: this.filters });
                resolve();
            });
        });
    }
    
    async saveSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.set({
                calendarFilterSettings: this.filters
            }, () => {
                console.log("🔍 Filtro de Calendario: Configuración guardada", this.filters);
                resolve();
            });
        });
    }
    
    setup() {
        console.log("🔍 Filtro de Calendario: Configurando UI y observers...");
        
        // Wait for calendar header to be available
        this.waitForCalendarHeader().then(() => {
            this.createFilterUI();
            this.applyFilters();
            this.setupMutationObserver();
        });
        
        console.log("🔍 Filtro de Calendario: Setup completo");
    }
    
    async waitForCalendarHeader() {
        return new Promise((resolve) => {
            const checkForHeader = () => {
                const header = document.querySelector('header.simulcast-calendar-header');
                if (header) {
                    console.log("🔍 Filtro de Calendario: Header del calendario encontrado");
                    resolve(header);
                } else {
                    console.log("🔍 Filtro de Calendario: Esperando al header del calendario...");
                    setTimeout(checkForHeader, 1000);
                }
            };
            checkForHeader();
        });
    }
    
    createFilterUI() {
        // Remove existing filter UI if present
        const existing = document.querySelector('.crunchyroll-power-up-calendar-filter');
        if (existing) {
            existing.remove();
        }
        
        // Find the correct injection point
        const header = document.querySelector('header.simulcast-calendar-header');
        if (!header) {
            console.log("🔍 Filtro de Calendario: Header del calendario no encontrado, no se puede inyectar la UI");
            return;
        }
        
        // Create main filter container
        const filterContainer = document.createElement('div');
        filterContainer.className = 'crunchyroll-power-up-calendar-filter';
        
        // Create header
        const filterHeader = document.createElement('div');
        filterHeader.className = 'crunchyroll-power-up-filter-header';
        
        const title = document.createElement('h2');
        title.className = 'crunchyroll-power-up-filter-title';
        title.textContent = this.getMessage('calendar_filter_ui_title');
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'crunchyroll-power-up-filter-toggle';
        toggleButton.textContent = this.isCollapsed ? this.getMessage('show_filters') : this.getMessage('hide_filters');
        toggleButton.addEventListener('click', () => this.toggleCollapse());
        
        filterHeader.appendChild(title);
        filterHeader.appendChild(toggleButton);
        
        // Create controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = `crunchyroll-power-up-filter-controls ${this.isCollapsed ? 'hidden' : ''}`;
        
        // Dubbed filter group
        const dubbedGroup = this.createFilterGroup('dubbed_filter', [
            { value: 'only', label: this.getMessage('dubbed_only'), emoji: '🎤' },
            { value: 'show', label: this.getMessage('dubbed_show'), emoji: '👁️' },
            { value: 'hide', label: this.getMessage('dubbed_hide'), emoji: '🚫' }
        ], this.filters.dubbed, 'radio');
        
        // Language filter group
        const languageOptions = [
            { value: 'english', label: this.getMessage('lang_english'), emoji: '🇺🇸', lang: 'english' },
            { value: 'spanish', label: this.getMessage('lang_spanish'), emoji: '🇪🇸', lang: 'spanish' },
            { value: 'french', label: this.getMessage('lang_french'), emoji: '🇫🇷', lang: 'french' },
            { value: 'german', label: this.getMessage('lang_german'), emoji: '🇩🇪', lang: 'german' },
            { value: 'others', label: this.getMessage('lang_others'), emoji: '🌍', lang: 'others' }
        ];
        const languageGroup = this.createLanguageFilterGroup(languageOptions);
        
        // In Queue filter group
        const queueGroup = this.createFilterGroup('queue_filter', [
            { value: 'only', label: this.getMessage('queue_only'), emoji: '📋' },
            { value: 'show', label: this.getMessage('queue_show'), emoji: '👁️' },
            { value: 'hide', label: this.getMessage('queue_hide'), emoji: '🚫' }
        ], this.filters.inQueue, 'radio');
        
        // Premiere filter group
        const premiereGroup = this.createFilterGroup('premiere_filter', [
            { value: 'only', label: this.getMessage('premiere_only'), emoji: '🌟' },
            { value: 'show', label: this.getMessage('premiere_show'), emoji: '👁️' },
            { value: 'hide', label: this.getMessage('premiere_hide'), emoji: '🚫' }
        ], this.filters.premiere, 'radio');
        
        controlsContainer.appendChild(dubbedGroup);
        controlsContainer.appendChild(languageGroup);
        controlsContainer.appendChild(queueGroup);
        controlsContainer.appendChild(premiereGroup);
        
        // Reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'crunchyroll-power-up-reset-filters';
        resetButton.textContent = this.getMessage('reset_filters');
        resetButton.addEventListener('click', () => this.resetFilters());
        controlsContainer.appendChild(resetButton);
        
        filterContainer.appendChild(filterHeader);
        filterContainer.appendChild(controlsContainer);
        
        // Insert into calendar header (correct injection point)
        header.appendChild(filterContainer);
        
        this.filterUI = filterContainer;
        console.log("🔍 Filtro de Calendario: UI creada e inyectada en el header del calendario");
    }
    
    createFilterGroup(titleKey, options, currentValue, inputType = 'radio') {
        const group = document.createElement('div');
        group.className = 'crunchyroll-power-up-filter-group';
        
        const title = document.createElement('div');
        title.className = 'crunchyroll-power-up-filter-group-title';
        title.textContent = this.getMessage(titleKey);
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'crunchyroll-power-up-filter-options';
        
        options.forEach(option => {
            const optionElement = document.createElement('label');
            optionElement.className = `crunchyroll-power-up-filter-option ${currentValue === option.value ? 'active' : ''}`;
            
            const input = document.createElement('input');
            input.type = inputType;
            input.name = titleKey;
            input.value = option.value;
            input.checked = currentValue === option.value;
            
            const emoji = document.createElement('span');
            emoji.className = 'emoji';
            emoji.textContent = option.emoji;
            
            const label = document.createElement('span');
            label.textContent = option.label;
            
            optionElement.appendChild(input);
            optionElement.appendChild(emoji);
            optionElement.appendChild(label);
            
            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const filterKey = titleKey.replace('_filter', '');
                    if (filterKey === 'queue') {
                        this.filters.inQueue = option.value;
                    } else {
                        this.filters[filterKey] = option.value;
                    }
                    
                    // Update UI
                    optionsContainer.querySelectorAll('.crunchyroll-power-up-filter-option').forEach(el => {
                        el.classList.remove('active');
                    });
                    optionElement.classList.add('active');
                    
                    // Save to both chrome storage and localStorage
                    this.saveSettings();
                    saveFiltersState(this.filters);
                    setTimeout(() => this.applyFilters(), 100);
                }
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        group.appendChild(title);
        group.appendChild(optionsContainer);
        
        return group;
    }
    
    createLanguageFilterGroup(options) {
        const group = document.createElement('div');
        group.className = 'crunchyroll-power-up-filter-group';
        
        const title = document.createElement('div');
        title.className = 'crunchyroll-power-up-filter-group-title';
        title.textContent = this.getMessage('language_filter');
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'crunchyroll-power-up-filter-options';
        
        options.forEach(option => {
            const optionElement = document.createElement('label');
            optionElement.className = `crunchyroll-power-up-filter-option ${this.filters.languages[option.value] ? 'active' : ''}`;
            optionElement.setAttribute('data-lang', option.lang);
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = option.value;
            input.checked = this.filters.languages[option.value];
            
            const emoji = document.createElement('span');
            emoji.className = 'emoji';
            emoji.textContent = option.emoji;
            
            const label = document.createElement('span');
            label.textContent = option.label;
            
            optionElement.appendChild(input);
            optionElement.appendChild(emoji);
            optionElement.appendChild(label);
            
            input.addEventListener('change', (e) => {
                this.filters.languages[option.value] = e.target.checked;
                
                if (e.target.checked) {
                    optionElement.classList.add('active');
                } else {
                    optionElement.classList.remove('active');
                }
                
                // Save to both chrome storage and localStorage
                this.saveSettings();
                saveFiltersState(this.filters);
                setTimeout(() => this.applyFilters(), 100);
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        group.appendChild(title);
        group.appendChild(optionsContainer);
        
        return group;
    }
    
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        const controls = this.filterUI.querySelector('.crunchyroll-power-up-filter-controls');
        const toggleButton = this.filterUI.querySelector('.crunchyroll-power-up-filter-toggle');
        
        if (this.isCollapsed) {
            controls.classList.add('hidden');
            toggleButton.classList.add('collapsed');
            toggleButton.textContent = this.getMessage('show_filters');
        } else {
            controls.classList.remove('hidden');
            toggleButton.classList.remove('collapsed');
            toggleButton.textContent = this.getMessage('hide_filters');
        }
        
        // Save panel state (inverted because true = open)
        savePanelState(!this.isCollapsed);
        console.log("🔍 Filtro de Calendario: Estado del panel guardado", !this.isCollapsed);
    }
    
    resetFilters() {
        console.log("🔍 Filtro de Calendario: Reiniciando filtros");
        
        // Clear persisted state
        clearPersistedState();
        
        this.filters = {
            dubbed: 'show',
            languages: {
                english: true,
                spanish: true,
                french: true,
                german: true,
                others: true
            },
            inQueue: 'show',
            premiere: 'show'
        };
        
        // Reset panel state to default (open)
        this.isCollapsed = false;
        
        this.saveSettings();
        this.createFilterUI();
        setTimeout(() => this.applyFilters(), 100);
        
        console.log("🔍 Filtro de Calendario: Filtros reiniciados y estado persistido borrado");
    }
    
    applyFilters() {
        console.log("🔍 Filtro de Calendario: Aplicando filtros...", this.filters);
        
        // Reset hidden counts
        this.hiddenCounts = {};
        
        // Find all episode elements using correct selectors
        const episodes = this.findEpisodeElements();
        console.log(`🔍 Filtro de Calendario: Encontrados ${episodes.length} episodios`);
        
        if (episodes.length === 0) {
            console.log("🔍 Filtro de Calendario: No se encontraron episodios, reintentando en 2 segundos");
            setTimeout(() => this.applyFilters(), 2000);
            return;
        }
        
        let hiddenCount = 0;
        let visibleCount = 0;
        
        episodes.forEach((episode, index) => {
            const episodeData = this.parseEpisodeData(episode);
            const shouldShow = this.shouldShowEpisode(episodeData);
            
            console.log(`🔍 Episodio ${index + 1}:`, {
                text: episode.textContent.substring(0, 50) + '...',
                data: episodeData,
                shouldShow: shouldShow
            });
            
            if (shouldShow) {
                this.showEpisode(episode);
                visibleCount++;
            } else {
                this.hideEpisode(episode);
                hiddenCount++;
                
                const dayContainer = this.findDayContainer(episode);
                if (dayContainer) {
                    const dayKey = this.getDayKey(dayContainer);
                    this.hiddenCounts[dayKey] = (this.hiddenCounts[dayKey] || 0) + 1;
                }
            }
        });
        
        // Update hidden counters
        this.updateHiddenCounters();
        
        console.log(`🔍 Filtro de Calendario: Filtros aplicados - ${visibleCount} visibles, ${hiddenCount} ocultos`, this.hiddenCounts);
    }
    
    findEpisodeElements() {
        // Use correct selector from original repository
        const episodes = document.querySelectorAll('article.js-release');
        
        if (episodes.length > 0) {
            console.log(`🔍 Filtro de Calendario: Encontrados ${episodes.length} episodios con el selector article.js-release`);
            return Array.from(episodes);
        }
        
        // Fallback selectors if the main one doesn't work
        const fallbackSelectors = [
            'article[class*="release"]',
            'li article',
            '[data-testid*="episode"]',
            '[class*="episode-card"]',
            'a[href*="/watch/"]'
        ];
        
        for (const selector of fallbackSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`🔍 Filtro de Calendario: Encontrados ${elements.length} episodios con selector alternativo: ${selector}`);
                    return Array.from(elements);
                }
            } catch (e) {
                console.log(`🔍 Filtro de Calendario: Selector inválido: ${selector}`, e);
            }
        }
        
        return [];
    }
    
    parseEpisodeData(episode) {
        // Get season title using correct selector
        const seasonTitleElement = episode.querySelector('h1.season-name cite');
        const seasonTitle = seasonTitleElement ? seasonTitleElement.textContent.trim() : episode.textContent.trim();
        
        console.log("🔍 Analizando episodio:", seasonTitle);
        
        // Use sophisticated dub detection patterns from original repository
        const dubData = this.detectDubLanguage(seasonTitle);
        
        // Check for queue status using correct selector
        const inQueue = episode.querySelector('.queue-flag.queued') !== null;
        
        // Check for premiere status using correct selector
        const isPremiere = episode.querySelector('.premiere-flag') !== null;
        
        // Check for progress
        const progressElement = episode.querySelector('progress');
        const hasProgress = progressElement && progressElement.value > 0;
        
        return {
            title: seasonTitle,
            isDubbed: dubData.isDub,
            languages: dubData.languages,
            inQueue: inQueue,
            isPremiere: isPremiere,
            hasProgress: hasProgress
        };
    }
    
    detectDubLanguage(title) {
        console.log("🔍 Detectando idioma doblado para:", title);
        
        let isDub = false;
        let languages = [];
        
        // Enhanced Spanish dub detection patterns
        const spanishPatterns = [
            /\(Spanish Dub\)/i,
            /\(Español\)/i,
            /\(Dub Español\)/i,
            /\(Español Dub\)/i,
            /\(Spanish\)/i,
            /\(Castellano\)/i,
            /\(Dub Castellano\)/i,
            /\(Latino\)/i,
            /\(Español Latino\)/i,
            /\(Spanish Latino\)/i,
            /\(Dub Latino\)/i
        ];
        
        // Enhanced English dub detection patterns
        const englishPatterns = [
            /\(English Dub\)/i,
            /\(Dub\)$/i,
            /\(English\)/i
        ];
        
        // Enhanced French dub detection patterns
        const frenchPatterns = [
            /\(French Dub\)/i,
            /\(Français\)/i,
            /\(Dub Français\)/i,
            /\(French\)/i
        ];
        
        // Enhanced German dub detection patterns
        const germanPatterns = [
            /\(German Dub\)/i,
            /\(Deutsch\)/i,
            /\(Dub Deutsch\)/i,
            /\(German\)/i
        ];
        
        // Check for Spanish dubs
        for (const pattern of spanishPatterns) {
            if (pattern.test(title)) {
                isDub = true;
                languages.push('spanish');
                console.log("✅ Doblaje en español detectado con patrón:", pattern);
                break;
            }
        }
        
        // Check for English dubs (only if Spanish not found)
        if (languages.length === 0) {
            for (const pattern of englishPatterns) {
                if (pattern.test(title)) {
                    isDub = true;
                    languages.push('english');
                    console.log("✅ Doblaje en inglés detectado con patrón:", pattern);
                    break;
                }
            }
        }
        
        // Check for French dubs (only if no other language found)
        if (languages.length === 0) {
            for (const pattern of frenchPatterns) {
                if (pattern.test(title)) {
                    isDub = true;
                    languages.push('french');
                    console.log("✅ Doblaje en francés detectado con patrón:", pattern);
                    break;
                }
            }
        }
        
        // Check for German dubs (only if no other language found)
        if (languages.length === 0) {
            for (const pattern of germanPatterns) {
                if (pattern.test(title)) {
                    isDub = true;
                    languages.push('german');
                    console.log("✅ Doblaje en alemán detectado con patrón:", pattern);
                    break;
                }
            }
        }
        
        // Fallback: Original sophisticated patterns for edge cases
        if (languages.length === 0) {
            const patterns = [
                // Standard dub detection
                /^(.*) ?(?:\(([A-Z][a-z]+(?:-(?:[A-Z]{2}))?(?: ?[A-Z][a-z]+)?) Dub\))?$/,
                // Crunchyroll Anime Awards detection
                /^(?!.*Japanese)(.*) (?:\(([A-Z][a-z]+(?:-(?:[A-Z]{2}))?) Audio\))?$/,
                // Anime Awards English dub
                /^(The \d{4} Crunchyroll Anime Awards)$/
            ];
            
            for (const pattern of patterns) {
                const match = title.match(pattern);
                if (match && match[2]) {
                    isDub = true;
                    const lang = match[2].toLowerCase();
                    if (lang.includes('english')) {
                        languages.push('english');
                    } else if (lang.includes('spanish') || lang.includes('español')) {
                        languages.push('spanish');
                    } else if (lang.includes('french') || lang.includes('français')) {
                        languages.push('french');
                    } else if (lang.includes('german') || lang.includes('deutsch')) {
                        languages.push('german');
                    } else {
                        languages.push('others');
                    }
                    console.log("✅ Idioma detectado vía patrón alternativo:", lang, "->", languages);
                    break;
                }
            }
        }
        
        // Final fallback: Generic dub detection
        const lowerTitle = title.toLowerCase();
        if ((lowerTitle.includes('dub') || lowerTitle.includes('dubbed')) && languages.length === 0) {
            isDub = true;
            // Default to English only if no Spanish indicators are present
            if (!lowerTitle.includes('español') && !lowerTitle.includes('spanish') && 
                !lowerTitle.includes('latino') && !lowerTitle.includes('castellano')) {
                languages.push('english');
                console.log("✅ Doblaje genérico en inglés detectado");
            }
        }
        
        console.log("🎯 Resultado final - isDub:", isDub, "languages:", languages);
        return { isDub, languages };
    }
    
    shouldShowEpisode(episodeData) {
        console.log("🔍 Comprobando si el episodio debe mostrarse:", {
            title: episodeData.title,
            isDubbed: episodeData.isDubbed,
            languages: episodeData.languages,
            filters: this.filters
        });
        
        // Check dubbed filter
        if (this.filters.dubbed === 'only' && !episodeData.isDubbed) {
            console.log("❌ Oculto: el filtro de doblaje está en 'only' pero el episodio no está doblado");
            return false;
        }
        if (this.filters.dubbed === 'hide' && episodeData.isDubbed) {
            console.log("❌ Oculto: el filtro de doblaje está en 'hide' y el episodio está doblado");
            return false;
        }
        
        // Check language filter (only applies to dubbed episodes)
        if (episodeData.isDubbed && episodeData.languages.length > 0) {
            // Get list of enabled languages
            const enabledLanguages = Object.keys(this.filters.languages).filter(lang => 
                this.filters.languages[lang] === true
            );
            
            console.log("🌐 Comprobación de idiomas - Idiomas del episodio:", episodeData.languages, "Idiomas habilitados:", enabledLanguages);
            
            if (enabledLanguages.length > 0) {
                const hasAllowedLanguage = episodeData.languages.some(lang => {
                    const isAllowed = this.filters.languages[lang] === true;
                    console.log(`  - Idioma '${lang}' permitido:`, isAllowed);
                    return isAllowed;
                });
                
                if (!hasAllowedLanguage) {
                    console.log("❌ Oculto: ningún idioma permitido coincide con los idiomas del episodio");
                    return false;
                }
            }
        }
        
        // Check in queue filter
        if (this.filters.inQueue === 'only' && !episodeData.inQueue) {
            console.log("❌ Oculto: el filtro 'en cola' está en 'only' pero el episodio no está en cola");
            return false;
        }
        if (this.filters.inQueue === 'hide' && episodeData.inQueue) {
            console.log("❌ Oculto: el filtro 'en cola' está en 'hide' y el episodio está en cola");
            return false;
        }
        
        // Check premiere filter
        if (this.filters.premiere === 'only' && !episodeData.isPremiere) {
            console.log("❌ Oculto: el filtro 'estrenos' está en 'only' pero el episodio no es estreno");
            return false;
        }
        if (this.filters.premiere === 'hide' && episodeData.isPremiere) {
            console.log("❌ Oculto: el filter 'estrenos' está en 'hide' y el episodio es estreno");
            return false;
        }
        
        console.log("✅ El episodio debe mostrarse");
        return true;
    }
    
    showEpisode(episode) {
        // Remove the correct hiding class from original repository
        episode.classList.remove('cr-rs-hide');
        episode.classList.add('crunchyroll-power-up-episode-visible');
    }
    
    hideEpisode(episode) {
        // Use the correct hiding class from original repository
        episode.classList.add('cr-rs-hide');
        episode.classList.remove('crunchyroll-power-up-episode-visible');
    }
    
    findDayContainer(episode) {
        // Look for parent containers that represent days
        let current = episode.parentElement;
        let depth = 0;
        
        while (current && current !== document.body && depth < 10) {
            if (current.classList.contains('day') || 
                current.querySelector('.specific-date') ||
                current.textContent.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)) {
                return current;
            }
            current = current.parentElement;
            depth++;
        }
        return null;
    }
    
    getDayKey(dayContainer) {
        const text = dayContainer.textContent;
        const dayMatch = text.match(/\b(mon|tue|wed|thu|fri|sat|sun)/i);
        const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}/);
        
        if (dayMatch) return dayMatch[1].toLowerCase();
        if (dateMatch) return dateMatch[0];
        return 'unknown';
    }
    
    updateHiddenCounters() {
        // Remove existing counters
        document.querySelectorAll('.crunchyroll-power-up-hidden-counter').forEach(counter => {
            counter.remove();
        });
        
        // Only show counters if feature flag is enabled
        if (!SHOW_HIDDEN_COUNT) {
            return;
        }
        
        // Add new counters
        Object.entries(this.hiddenCounts).forEach(([dayKey, count]) => {
            if (count > 0) {
                const dayContainers = this.findDayContainersByKey(dayKey);
                dayContainers.forEach(container => {
                    const counter = document.createElement('div');
                    counter.className = 'crunchyroll-power-up-hidden-counter';
                    counter.textContent = `${count} ${this.getMessage('hidden')}`;
                    
                    if (getComputedStyle(container).position === 'static') {
                        container.style.position = 'relative';
                    }
                    container.classList.add('crunchyroll-power-up-day-container');
                    
                    container.appendChild(counter);
                    
                    setTimeout(() => {
                        counter.classList.add('visible');
                    }, 100);
                });
            }
        });
    }
    
    findDayContainersByKey(dayKey) {
        const containers = [];
        const dayElements = document.querySelectorAll('.day, .specific-date');
        
        dayElements.forEach(el => {
            const text = el.textContent.toLowerCase();
            if ((dayKey.length === 3 && text.includes(dayKey)) ||
                (dayKey.includes('/') && text.includes(dayKey)) ||
                (dayKey.includes('-') && text.includes(dayKey))) {
                containers.push(el);
            }
        });
        
        return containers;
    }
    
    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldReapply = false;
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasEpisodes = node.querySelector && (
                                node.querySelector('article.js-release') ||
                                node.querySelector('[class*="episode"]') ||
                                node.querySelector('a[href*="/watch/"]')
                            );
                            if (hasEpisodes) {
                                shouldReapply = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldReapply) {
                console.log("🔍 Filtro de Calendario: Nuevo contenido detectado, re-aplicando filtros");
                setTimeout(() => this.applyFilters(), 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log("🔍 Filtro de Calendario: Mutation observer configurado");
    }
    
    getMessage(key) {
        const messages = {
            calendar_filter_ui_title: 'Filtro de calendario',
            show_filters: 'Mostrar filtros',
            hide_filters: 'Ocultar filtros',
            dubbed_filter: 'Episodios doblados',
            dubbed_only: 'Solo',
            dubbed_show: 'Mostrar',
            dubbed_hide: 'Ocultar',
            language_filter: 'Idiomas',
            lang_english: 'Inglés',
            lang_spanish: 'Español',
            lang_french: 'Francés',
            lang_german: 'Alemán',
            lang_others: 'Otros',
            queue_filter: 'En la cola',
            queue_only: 'Solo',
            queue_show: 'Mostrar',
            queue_hide: 'Ocultar',
            premiere_filter: 'Estrenos',
            premiere_only: 'Solo',
            premiere_show: 'Mostrar',
            premiere_hide: 'Ocultar',
            reset_filters: 'Restablecer filtros',
            hidden: 'Oculto'
         };
        
        if (typeof chrome !== 'undefined' && chrome.i18n) {
            return chrome.i18n.getMessage(key) || messages[key] || key;
        }
        
        return messages[key] || key;
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CrunchyrollPowerUpCalendarFilter();
    });
} else {
    new CrunchyrollPowerUpCalendarFilter();
}

// También inicializar cuando cambie la URL (para aplicaciones SPA)
if (!window.crunchyrollPowerUpLastUrl) {
    window.crunchyrollPowerUpLastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== window.crunchyrollPowerUpLastUrl) {
            window.crunchyrollPowerUpLastUrl = url;
            console.log("🔍 Filtro de Calendario: URL cambiada, re-inicializando");
            setTimeout(() => {
                new CrunchyrollPowerUpCalendarFilter();
            }, 2000);
        }
    }).observe(document, { subtree: true, childList: true });
}

console.log("🔍 Filtro de Calendario de Crunchyroll Power Up: Script inicializado");