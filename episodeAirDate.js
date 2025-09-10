
// Episode Air Date functionality for Crunchy+ Plus - DOM Parsing Implementation
console.log("🟠 Crunchy+ Plus: EpisodeAirDate module loaded (DOM parsing version)");

// Simple Renderer class to match reference implementation
class Renderer {
  constructor(tagName) {
    this.element = document.createElement(tagName);
  }

  addClass(className) {
    this.element.classList.add(className);
    return this;
  }

  setText(text) {
    this.element.textContent = text;
    return this;
  }

  getElement() {
    return this.element;
  }

  remove() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

class EpisodeAirDate {
  constructor(seriesId, seasons, episodes) {
    this.seriesId = seriesId;
    this.seasons = seasons;
    this.episodes = episodes;
    this.container = null;
    this.actionButtons = null;

    this.actionButtons = document.querySelector('.erc-series-hero-actions');
    if (!this.actionButtons) {
      new MutationObserver((_, observer) => {
        this.actionButtons = document.querySelector('.erc-series-hero-actions');
        if (!this.actionButtons) return;
        observer.disconnect();
        this.createElement();
      }).observe(document.getElementById('content'), {
        childList: true,
        subtree: true,
      });
    } else {
      this.createElement();
    }
  }

  createElement() {
    this.getAirDate((date) => {
      if (!date) return;

      this.container = new Renderer('p')
        .addClass('next-air-date')
        .setText(this.getLocalizedMessage([
          Intl.DateTimeFormat(undefined, {
            day: '2-digit',
            weekday: 'long',
            month: '2-digit',
          }).format(date), 
          Intl.DateTimeFormat(undefined, {
            minute: '2-digit',
            hour: '2-digit',
          }).format(date)
        ]))
        .getElement();

      // Append to the original action buttons container if available; otherwise fallback to body.
      const parent = this.actionButtons || document.querySelector('.erc-series-hero-actions') || document.body;
      parent.append(this.container);
    });
  }

  /**
   * Parse Crunchyroll release date from DOM elements
   * Looks for patterns like "Available Wed, Aug 13 · 08:05 AM PDT"
   */
  parseCrunchyrollReleaseTime() {
    try {
      // Look for release date elements with various selectors
      const selectors = [
        '.release-date',
        '[data-testid="release-date"]',
        '.episode-release-date',
        '.availability-date',
        '.air-date',
        '.episode-air-date'
      ];

      let releaseElement = null;
      let releaseText = '';

      // Try each selector
      for (const selector of selectors) {
        releaseElement = document.querySelector(selector);
        if (releaseElement) {
          releaseText = releaseElement.textContent.trim();
          console.log(`🟠 Crunchy+ Plus: Found release element with selector "${selector}":`, releaseText);
          break;
        }
      }

      // If no specific release date element found, look in episode containers
      if (!releaseText) {
        const episodeContainers = document.querySelectorAll('[class*="episode"], [class*="card"], [data-testid*="episode"]');
        
        for (const container of episodeContainers) {
          const text = container.textContent;
          // Look for "Available" pattern in episode containers
          const availableMatch = text.match(/Available\s+[^·]+·[^·]+/i);
          if (availableMatch) {
            releaseText = availableMatch[0];
            console.log("🟠 Crunchy+ Plus: Found release text in episode container:", releaseText);
            break;
          }
        }
      }

      // If still no text found, look for any text containing "Available" pattern
      if (!releaseText) {
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
          const text = element.textContent;
          if (text && text.includes('Available') && text.includes('·')) {
            const availableMatch = text.match(/Available\s+[^·]+·[^·]+/i);
            if (availableMatch) {
              releaseText = availableMatch[0];
              console.log("🟠 Crunchy+ Plus: Found release text in general search:", releaseText);
              break;
            }
          }
        }
      }

      if (!releaseText) {
        console.warn("🟠 Crunchy+ Plus: No release date text found in DOM");
        return null;
      }

      // Parse the release text
      // Expected format: "Available Wed, Aug 13 · 08:05 AM PDT"
      const releaseMatch = releaseText.match(/Available\s+(\w+),\s+(\w+)\s+(\d+)\s+·\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+(\w+)/i);
      
      if (!releaseMatch) {
        console.warn("🟠 Crunchy+ Plus: Could not parse release date format:", releaseText);
        return null;
      }

      const [, dayName, monthName, day, hour, minute, ampm, timezone] = releaseMatch;
      
      // Convert month name to number
      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      
      const monthNum = monthMap[monthName];
      if (monthNum === undefined) {
        console.warn("🟠 Crunchy+ Plus: Unknown month name:", monthName);
        return null;
      }

      // Convert 12-hour to 24-hour format
      let hour24 = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
        hour24 = 0;
      }

      // Create date object (assuming current year for now)
      const currentYear = new Date().getFullYear();
      const releaseDate = new Date(currentYear, monthNum, parseInt(day), hour24, parseInt(minute));
      
      // If the date is in the past, assume it's next year
      if (releaseDate < new Date()) {
        releaseDate.setFullYear(currentYear + 1);
      }

      console.log("🟠 Crunchy+ Plus: Parsed release date:", {
        originalText: releaseText,
        parsedDate: releaseDate,
        timezone: timezone
      });

      return releaseDate;

    } catch (error) {
      console.error("🟠 Crunchy+ Plus: Error parsing Crunchyroll release time:", error);
      return null;
    }
  }

  getAirDate(callback) {
    if (!window.anilistCache) {
      window.anilistCache = {};
    }
    
    // Check cache first
    if (window.anilistCache[this.seriesId] && window.anilistCache[this.seriesId].nextAiringDate > new Date()) {
      callback(window.anilistCache[this.seriesId].nextAiringDate);
      return;
    }

    // Get AniList data for the base date
    chrome.runtime.sendMessage(chrome.runtime.id, {
      type: 'anilist',
      data: {
        query: `query {
          Media(search: "${document.location.pathname.split('/').slice(-1)[0]}", type: ANIME, status: RELEASING) {
            nextAiringEpisode {
              airingAt
            }
          }
        }`,
      },
    }, async (response) => {
      try {
        const airingAt = response?.data?.Media?.nextAiringEpisode?.airingAt;

        if (!window.anilistCache[this.seriesId]) {
          window.anilistCache[this.seriesId] = {};
        }
        
        if (airingAt) {
          const anilistDate = new Date(airingAt * 1000);
          console.log("🟠 Crunchy+ Plus: AniList base date:", anilistDate);

          // Try to get more accurate timing from DOM
          const crunchyrollTime = this.parseCrunchyrollReleaseTime();
          
          if (crunchyrollTime) {
            // Use hybrid approach: AniList date + Crunchyroll time
            const hybridDate = new Date(
              anilistDate.getFullYear(),
              anilistDate.getMonth(),
              anilistDate.getDate(),
              crunchyrollTime.getHours(),
              crunchyrollTime.getMinutes(),
              crunchyrollTime.getSeconds()
            );
            
            console.log("🟠 Crunchy+ Plus: Hybrid timing calculated:", {
              anilistDate: anilistDate,
              crunchyrollTime: crunchyrollTime,
              finalDate: hybridDate
            });
            
            window.anilistCache[this.seriesId].nextAiringDate = hybridDate;
            callback(hybridDate);
          } else {
            // Fallback to AniList only
            console.log("🟠 Crunchy+ Plus: Using AniList date only (no DOM timing found)");
            window.anilistCache[this.seriesId].nextAiringDate = anilistDate;
            callback(anilistDate);
          }
        } else {
          // No AniList data, try DOM-only approach
          const crunchyrollTime = this.parseCrunchyrollReleaseTime();
          if (crunchyrollTime) {
            console.log("🟠 Crunchy+ Plus: Using DOM-only timing:", crunchyrollTime);
            window.anilistCache[this.seriesId].nextAiringDate = crunchyrollTime;
            callback(crunchyrollTime);
          } else {
            console.log("🟠 Crunchy+ Plus: No timing data available");
            window.anilistCache[this.seriesId].nextAiringDate = null;
          }
        }
      } catch (error) {
        console.error("🟠 Crunchy+ Plus: Error in getAirDate:", error);
        window.anilistCache[this.seriesId].nextAiringDate = null;
      }
    });
  }

  getLocalizedMessage(dateTimeArray) {
    const [dateText, timeText] = dateTimeArray;
    
    // Use Chrome i18n if available, otherwise fallback to manual detection
    if (chrome.i18n && chrome.i18n.getMessage) {
      try {
        const message = chrome.i18n.getMessage('nextEpisodeAirsAt', [dateText, timeText]);
        if (message) return message;
      } catch (error) {
        console.warn("🟠 Crunchy+ Plus: Chrome i18n not available, using fallback");
      }
    }
    
    // Fallback to manual language detection
    const lang = this.getCurrentLanguage();
    
    if (lang === 'es') {
      return `El próximo episodio se emite el ${dateText} a ${timeText}`;
    } else {
      return `Next episode airs on ${dateText} at ${timeText}`;
    }
  }

  getCurrentLanguage() {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('es')) return 'es';
    return 'en';
  }

  destroy() {
    this.container?.remove();
  }
}

// Initialize when DOM is ready
function initializeEpisodeAirDate() {
  // Check if we're on a series page
  const pathMatch = location.pathname.match(/(?<=\/series\/)[^\/]*/);
  if (!pathMatch) return;
  
  const seriesId = pathMatch[0];
  if (!seriesId) return;

  console.log("🟠 Crunchy+ Plus: Initializing EpisodeAirDate for series:", seriesId);
  
  // Create mock seasons and episodes promises for compatibility
  const seasons = Promise.resolve([{
    id: seriesId,
    season_sequence_number: 1,
    title: "Season 1"
  }]);
  
  const episodes = {
    [seriesId]: Promise.resolve([{
      id: seriesId + "_ep1",
      sequence_number: 1,
      availability_starts: new Date().toISOString(),
      episode_air_date: new Date().toISOString()
    }])
  };

  new EpisodeAirDate(seriesId, seasons, episodes);
}

// Export for use in content script
window.EpisodeAirDate = EpisodeAirDate;
window.initializeEpisodeAirDate = initializeEpisodeAirDate;

// Auto-initialize if on series page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEpisodeAirDate);
} else {
  initializeEpisodeAirDate();
}
