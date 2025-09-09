
// Crunchyroll Power Up Calendar Filter v1.6.32
// Advanced filtering system for Crunchyroll release calendar
// Based on proven patterns from roshinc/release-calendar-filter-for-crunchyroll

console.log("🔍 Crunchyroll Power Up Calendar Filter: Script loaded");

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
        console.warn("🔍 Calendar Filter: Failed to save panel state", e);
    }
}

function loadPanelState() {
    try {
        const saved = localStorage.getItem(LS_PANEL_STATE);
        return saved !== null ? JSON.parse(saved) : true; // Default to open
    } catch (e) {
        console.warn("🔍 Calendar Filter: Failed to load panel state", e);
        return true;
    }
}

function saveFiltersState(filters) {
    try {
        localStorage.setItem(LS_FILTERS_STATE, JSON.stringify(filters));
    } catch (e) {
        console.warn("🔍 Calendar Filter: Failed to save filters state", e);
    }
}

function loadFiltersState() {
    try {
        const saved = localStorage.getItem(LS_FILTERS_STATE);
        return saved !== null ? JSON.parse(saved) : null;
    } catch (e) {
        console.warn("🔍 Calendar Filter: Failed to load filters state", e);
        return null;
    }
}

function clearPersistedState() {
    try {
        localStorage.removeItem(LS_PANEL_STATE);
        localStorage.removeItem(LS_FILTERS_STATE);
        console.log("🔍 Calendar Filter: Cleared persisted state");
    } catch (e) {
        console.warn("🔍 Calendar Filter: Failed to clear persisted state", e);
    }
}

class CrunchyPlusCalendarFilter {
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
        
        // Load persisted state early to prevent flickering
        this.isCollapsed = !loadPanelState(); // Panel state is inverted (true = open)
        const savedFilters = loadFiltersState();
        if (savedFilters) {
            this.filters = { ...this.filters, ...savedFilters };
            console.log("🔍 Calendar Filter: Loaded persisted filters", this.filters);
        }
        
        // Language constants from original repository
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
        console.log("🔍 Calendar Filter: Initializing...");
        
        // Check if we're on the calendar page
        if (!this.isCalendarPage()) {
            console.log("🔍 Calendar Filter: Not on calendar page, skipping");
            return;
        }
        
        // Load settings
        await this.loadSettings();
        
        if (!this.isEnabled) {
            console.log("🔍 Calendar Filter: Disabled in settings");
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
        
        console.log("🔍 Calendar Filter: Calendar page check:", isCalendar, window.location.pathname);
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
                console.log("🔍 Calendar Filter: Settings loaded", { enabled: this.isEnabled, filters: this.filters });
                resolve();
            });
        });
    }
    
    async saveSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.set({
                calendarFilterSettings: this.filters
            }, () => {
                console.log("🔍 Calendar Filter: Settings saved", this.filters);
                resolve();
            });
        });
    }
    
    setup() {
        console.log("🔍 Calendar Filter: Setting up UI and observers...");
        
        // Wait for calendar header to be available
        this.waitForCalendarHeader().then(() => {
            this.createFilterUI();
            this.applyFilters();
            this.setupMutationObserver();
        });
        
        console.log("🔍 Calendar Filter: Setup complete");
    }
    
    async waitForCalendarHeader() {
        return new Promise((resolve) => {
            const checkForHeader = () => {
                const header = document.querySelector('header.simulcast-calendar-header');
                if (header) {
                    console.log("🔍 Calendar Filter: Found calendar header");
                    resolve(header);
                } else {
                    console.log("🔍 Calendar Filter: Waiting for calendar header...");
                    setTimeout(checkForHeader, 1000);
                }
            };
            checkForHeader();
        });
    }
    
    createFilterUI() {
        // Remove existing filter UI if present
        const existing = document.querySelector('.crunchy-plus-calendar-filter');
        if (existing) {
            existing.remove();
        }
        
        // Find the correct injection point
        const header = document.querySelector('header.simulcast-calendar-header');
        if (!header) {
            console.log("🔍 Calendar Filter: Calendar header not found, cannot inject UI");
            return;
        }
        
        // Create main filter container
        const filterContainer = document.createElement('div');
        filterContainer.className = 'crunchy-plus-calendar-filter';
        
        // Create header
        const filterHeader = document.createElement('div');
        filterHeader.className = 'crunchy-plus-filter-header';
        
        const title = document.createElement('h2');
        title.className = 'crunchy-plus-filter-title';
        title.textContent = this.getMessage('calendar_filter_ui_title');
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'crunchy-plus-filter-toggle';
        toggleButton.textContent = this.isCollapsed ? this.getMessage('show_filters') : this.getMessage('hide_filters');
        toggleButton.addEventListener('click', () => this.toggleCollapse());
        
        filterHeader.appendChild(title);
        filterHeader.appendChild(toggleButton);
        
        // Create controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = `crunchy-plus-filter-controls ${this.isCollapsed ? 'hidden' : ''}`;
        
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
        resetButton.className = 'crunchy-plus-reset-filters';
        resetButton.textContent = this.getMessage('reset_filters');
        resetButton.addEventListener('click', () => this.resetFilters());
        controlsContainer.appendChild(resetButton);
        
        filterContainer.appendChild(filterHeader);
        filterContainer.appendChild(controlsContainer);
        
        // Insert into calendar header (correct injection point)
        header.appendChild(filterContainer);
        
        this.filterUI = filterContainer;
        console.log("🔍 Calendar Filter: UI created and injected into calendar header");
    }
    
    createFilterGroup(titleKey, options, currentValue, inputType = 'radio') {
        const group = document.createElement('div');
        group.className = 'crunchy-plus-filter-group';
        
        const title = document.createElement('div');
        title.className = 'crunchy-plus-filter-group-title';
        title.textContent = this.getMessage(titleKey);
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'crunchy-plus-filter-options';
        
        options.forEach(option => {
            const optionElement = document.createElement('label');
            optionElement.className = `crunchy-plus-filter-option ${currentValue === option.value ? 'active' : ''}`;
            
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
                    optionsContainer.querySelectorAll('.crunchy-plus-filter-option').forEach(el => {
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
        group.className = 'crunchy-plus-filter-group';
        
        const title = document.createElement('div');
        title.className = 'crunchy-plus-filter-group-title';
        title.textContent = this.getMessage('language_filter');
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'crunchy-plus-filter-options';
        
        options.forEach(option => {
            const optionElement = document.createElement('label');
            optionElement.className = `crunchy-plus-filter-option ${this.filters.languages[option.value] ? 'active' : ''}`;
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
        const controls = this.filterUI.querySelector('.crunchy-plus-filter-controls');
        const toggleButton = this.filterUI.querySelector('.crunchy-plus-filter-toggle');
        
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
        console.log("🔍 Calendar Filter: Panel state saved", !this.isCollapsed);
    }
    
    resetFilters() {
        console.log("🔍 Calendar Filter: Resetting filters");
        
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
        
        console.log("🔍 Calendar Filter: Filters reset and persisted state cleared");
    }
    
    applyFilters() {
        console.log("🔍 Calendar Filter: Applying filters...", this.filters);
        
        // Reset hidden counts
        this.hiddenCounts = {};
        
        // Find all episode elements using correct selectors
        const episodes = this.findEpisodeElements();
        console.log(`🔍 Calendar Filter: Found ${episodes.length} episodes`);
        
        if (episodes.length === 0) {
            console.log("🔍 Calendar Filter: No episodes found, retrying in 2 seconds");
            setTimeout(() => this.applyFilters(), 2000);
            return;
        }
        
        let hiddenCount = 0;
        let visibleCount = 0;
        
        episodes.forEach((episode, index) => {
            const episodeData = this.parseEpisodeData(episode);
            const shouldShow = this.shouldShowEpisode(episodeData);
            
            console.log(`🔍 Episode ${index + 1}:`, {
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
        
        console.log(`🔍 Calendar Filter: Filters applied - ${visibleCount} visible, ${hiddenCount} hidden`, this.hiddenCounts);
    }
    
    findEpisodeElements() {
        // Use correct selector from original repository
        const episodes = document.querySelectorAll('article.js-release');
        
        if (episodes.length > 0) {
            console.log(`🔍 Calendar Filter: Found ${episodes.length} episodes with article.js-release selector`);
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
                    console.log(`🔍 Calendar Filter: Found ${elements.length} episodes with fallback selector: ${selector}`);
                    return Array.from(elements);
                }
            } catch (e) {
                console.log(`🔍 Calendar Filter: Invalid selector: ${selector}`, e);
            }
        }
        
        return [];
    }
    
    parseEpisodeData(episode) {
        // Get season title using correct selector
        const seasonTitleElement = episode.querySelector('h1.season-name cite');
        const seasonTitle = seasonTitleElement ? seasonTitleElement.textContent.trim() : episode.textContent.trim();
        
        console.log("🔍 Parsing episode:", seasonTitle);
        
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
        console.log("🔍 Detecting dub language for:", title);
        
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
                console.log("✅ Spanish dub detected with pattern:", pattern);
                break;
            }
        }
        
        // Check for English dubs (only if Spanish not found)
        if (languages.length === 0) {
            for (const pattern of englishPatterns) {
                if (pattern.test(title)) {
                    isDub = true;
                    languages.push('english');
                    console.log("✅ English dub detected with pattern:", pattern);
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
                    console.log("✅ French dub detected with pattern:", pattern);
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
                    console.log("✅ German dub detected with pattern:", pattern);
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
                    console.log("✅ Language detected via fallback pattern:", lang, "->", languages);
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
                console.log("✅ Generic English dub detected");
            }
        }
        
        console.log("🎯 Final result - isDub:", isDub, "languages:", languages);
        return { isDub, languages };
    }
    
    shouldShowEpisode(episodeData) {
        console.log("🔍 Checking if episode should show:", {
            title: episodeData.title,
            isDubbed: episodeData.isDubbed,
            languages: episodeData.languages,
            filters: this.filters
        });
        
        // Check dubbed filter
        if (this.filters.dubbed === 'only' && !episodeData.isDubbed) {
            console.log("❌ Hidden: dubbed filter is 'only' but episode is not dubbed");
            return false;
        }
        if (this.filters.dubbed === 'hide' && episodeData.isDubbed) {
            console.log("❌ Hidden: dubbed filter is 'hide' and episode is dubbed");
            return false;
        }
        
        // Check language filter (only applies to dubbed episodes)
        if (episodeData.isDubbed && episodeData.languages.length > 0) {
            // Get list of enabled languages
            const enabledLanguages = Object.keys(this.filters.languages).filter(lang => 
                this.filters.languages[lang] === true
            );
            
            console.log("🌐 Language check - Episode languages:", episodeData.languages, "Enabled languages:", enabledLanguages);
            
            if (enabledLanguages.length > 0) {
                const hasAllowedLanguage = episodeData.languages.some(lang => {
                    const isAllowed = this.filters.languages[lang] === true;
                    console.log(`  - Language '${lang}' allowed:`, isAllowed);
                    return isAllowed;
                });
                
                if (!hasAllowedLanguage) {
                    console.log("❌ Hidden: no allowed languages match episode languages");
                    return false;
                }
            }
        }
        
        // Check in queue filter
        if (this.filters.inQueue === 'only' && !episodeData.inQueue) {
            console.log("❌ Hidden: queue filter is 'only' but episode is not in queue");
            return false;
        }
        if (this.filters.inQueue === 'hide' && episodeData.inQueue) {
            console.log("❌ Hidden: queue filter is 'hide' and episode is in queue");
            return false;
        }
        
        // Check premiere filter
        if (this.filters.premiere === 'only' && !episodeData.isPremiere) {
            console.log("❌ Hidden: premiere filter is 'only' but episode is not premiere");
            return false;
        }
        if (this.filters.premiere === 'hide' && episodeData.isPremiere) {
            console.log("❌ Hidden: premiere filter is 'hide' and episode is premiere");
            return false;
        }
        
        console.log("✅ Episode should be shown");
        return true;
    }
    
    showEpisode(episode) {
        // Remove the correct hiding class from original repository
        episode.classList.remove('cr-rs-hide');
        episode.classList.add('crunchy-plus-episode-visible');
    }
    
    hideEpisode(episode) {
        // Use the correct hiding class from original repository
        episode.classList.add('cr-rs-hide');
        episode.classList.remove('crunchy-plus-episode-visible');
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
        document.querySelectorAll('.crunchy-plus-hidden-counter').forEach(counter => {
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
                    counter.className = 'crunchy-plus-hidden-counter';
                    counter.textContent = `${count} ${this.getMessage('hidden')}`;
                    
                    if (getComputedStyle(container).position === 'static') {
                        container.style.position = 'relative';
                    }
                    container.classList.add('crunchy-plus-day-container');
                    
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
                console.log("🔍 Calendar Filter: New content detected, reapplying filters");
                setTimeout(() => this.applyFilters(), 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log("🔍 Calendar Filter: Mutation observer set up");
    }
    
    getMessage(key) {
        const messages = {
            calendar_filter_ui_title: 'Calendar Filter',
            show_filters: 'Show Filters',
            hide_filters: 'Hide Filters',
            dubbed_filter: 'Dubbed Episodes',
            dubbed_only: 'Only',
            dubbed_show: 'Show',
            dubbed_hide: 'Hide',
            language_filter: 'Languages',
            lang_english: 'English',
            lang_spanish: 'Spanish',
            lang_french: 'French',
            lang_german: 'German',
            lang_others: 'Others',
            queue_filter: 'In Queue',
            queue_only: 'Only',
            queue_show: 'Show',
            queue_hide: 'Hide',
            premiere_filter: 'Premieres',
            premiere_only: 'Only',
            premiere_show: 'Show',
            premiere_hide: 'Hide',
            reset_filters: 'Reset Filters',
            hidden: 'Hidden'
        };
        
        if (typeof chrome !== 'undefined' && chrome.i18n) {
            return chrome.i18n.getMessage(key) || messages[key] || key;
        }
        
        return messages[key] || key;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CrunchyPlusCalendarFilter();
    });
} else {
    new CrunchyPlusCalendarFilter();
}

// Also initialize on page navigation (for SPAs)
if (!window.crunchyPlusLastUrl) {
    window.crunchyPlusLastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== window.crunchyPlusLastUrl) {
            window.crunchyPlusLastUrl = url;
            console.log("🔍 Calendar Filter: URL changed, reinitializing");
            setTimeout(() => {
                new CrunchyPlusCalendarFilter();
            }, 2000);
        }
    }).observe(document, { subtree: true, childList: true });
}

console.log("🔍 Crunchyroll Power Up Calendar Filter: Script initialized");
