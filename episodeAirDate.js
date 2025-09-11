// Funcionalidad de Fecha de Emisión del Episodio para Crunchyroll Power Up - Implementación por parseo del DOM
console.log("Crunchyroll Power Up: Módulo Fecha de Emisión cargado (parseo DOM)");

// Clase Renderer simple para coincidir con la implementación de referencia
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
    if (this.actionButtons) {
      this.createElement();
    }
  }

  createElement() {
    // Comprobar si el elemento ya existe para evitar duplicados
    if (document.querySelector('.next-air-date')) {
      console.log("Crunchyroll Power Up: El elemento de próxima emisión ya existe, se omite la creación.");
      return;
    }

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

      // Añadir al contenedor original de botones de acción si está disponible; si no, usar el body como fallback.
      const parent = this.actionButtons || document.querySelector('.erc-series-hero-actions') || document.body;
      parent.append(this.container);
    });
  }

  /**
   * Analiza la fecha de estreno en Crunchyroll a partir del DOM
   * Busca patrones como "Available Wed, Aug 13 · 08:05 AM PDT"
   */
  parseCrunchyrollReleaseTime() {
    try {
      // Buscar elementos de fecha de lanzamiento con varios selectores
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

      // Probar cada selector
      for (const selector of selectors) {
        releaseElement = document.querySelector(selector);
        if (releaseElement) {
          releaseText = releaseElement.textContent.trim();
      console.log(`Crunchyroll Power Up: Elemento de fecha encontrado con selector "${selector}":`, releaseText);
          break;
        }
      }

      // Si no se encuentra un elemento de fecha específico, buscar en contenedores de episodios
      if (!releaseText) {
        const episodeContainers = document.querySelectorAll('[class*="episode"], [class*="card"], [data-testid*="episode"]');
        
        for (const container of episodeContainers) {
          const text = container.textContent;
          // Buscar el patrón "Available" en los contenedores de episodios
          const availableMatch = text.match(/Available\s+[^·]+·[^·]+/i);
          if (availableMatch) {
            releaseText = availableMatch[0];
            console.log("Crunchyroll Power Up: Texto de fecha encontrado en contenedor de episodio:", releaseText);
            break;
          }
        }
      }

      // Si aún no se encuentra texto, buscar en cualquier elemento que contenga el patrón "Available"
      if (!releaseText) {
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
          const text = element.textContent;
          if (text && text.includes('Available') && text.includes('·')) {
            const availableMatch = text.match(/Available\s+[^·]+·[^·]+/i);
            if (availableMatch) {
              releaseText = availableMatch[0];
              console.log("Crunchyroll Power Up: Texto de fecha encontrado en búsqueda general:", releaseText);
              break;
            }
          }
        }
      }

      if (!releaseText) {
        console.log("Crunchyroll Power Up: No se encontró texto de fecha en el DOM (esperable si no hay próximo episodio o el DOM cambió)");
        return null;
      }

      // Parsear el texto de lanzamiento
      // Formato esperado: "Available Wed, Aug 13 · 08:05 AM PDT"
      const releaseMatch = releaseText.match(/Available\s+(\w+),\s+(\w+)\s+(\d+)\s+·\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+(\w+)/i);
      
      if (!releaseMatch) {
  console.warn("Crunchyroll Power Up: No se pudo analizar el formato de la fecha de estreno:", releaseText);
        return null;
      }

      const [, dayName, monthName, day, hour, minute, ampm, timezone] = releaseMatch;
      
      // Convertir nombre del mes a número
      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      
      const monthNum = monthMap[monthName];
      if (monthNum === undefined) {
        console.warn("Crunchyroll Power Up: Unknown month name:", monthName);
        return null;
      }

      // Convertir formato de 12 horas a 24 horas
      let hour24 = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
        hour24 = 0;
      }

      // Crear objeto Date (asumiendo el año actual por ahora)
      const currentYear = new Date().getFullYear();
      const releaseDate = new Date(currentYear, monthNum, parseInt(day), hour24, parseInt(minute));
      
      // Si la fecha está en el pasado, asumir que es el próximo año
      if (releaseDate < new Date()) {
        releaseDate.setFullYear(currentYear + 1);
      }

  console.log("Crunchyroll Power Up: Fecha de estreno analizada:", {
        originalText: releaseText,
        parsedDate: releaseDate,
        timezone: timezone
      });

      return releaseDate;

    } catch (error) {
      console.error("Crunchyroll Power Up: Error parsing Crunchyroll release time:", error);
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

    // Obtener datos de AniList como fecha base
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
          console.log("Crunchyroll Power Up: AniList base date:", anilistDate);

          // Intentar obtener una hora más precisa desde el DOM
          const crunchyrollTime = this.parseCrunchyrollReleaseTime();
          
          if (crunchyrollTime) {
            // Usar enfoque híbrido: fecha de AniList + hora de Crunchyroll
            const hybridDate = new Date(
              anilistDate.getFullYear(),
              anilistDate.getMonth(),
              anilistDate.getDate(),
              crunchyrollTime.getHours(),
              crunchyrollTime.getMinutes(),
              crunchyrollTime.getSeconds()
            );
            
            console.log("Crunchyroll Power Up: Hybrid timing calculated:", {
              anilistDate: anilistDate,
              crunchyrollTime: crunchyrollTime,
              finalDate: hybridDate
            });
            
            window.anilistCache[this.seriesId].nextAiringDate = hybridDate;
            callback(hybridDate);
          } else {
            // Fallback a AniList únicamente
            console.log("Crunchyroll Power Up: Using AniList date only (no DOM timing found)");
            window.anilistCache[this.seriesId].nextAiringDate = anilistDate;
            callback(anilistDate);
          }
        } else {
          // Sin datos AniList, intentar solo por DOM
          const crunchyrollTime = this.parseCrunchyrollReleaseTime();
          if (crunchyrollTime) {
            console.log("Crunchyroll Power Up: Using DOM-only timing:", crunchyrollTime);
            window.anilistCache[this.seriesId].nextAiringDate = crunchyrollTime;
            callback(crunchyrollTime);
          } else {
            console.log("Crunchyroll Power Up: No timing data available");
            window.anilistCache[this.seriesId].nextAiringDate = null;
          }
        }
      } catch (error) {
        console.error("Crunchyroll Power Up: Error in getAirDate:", error);
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
        console.warn("Crunchyroll Power Up: Chrome i18n not available, using fallback");
      }
    }
    
    // Fallback a detección de idioma manual
    const lang = this.getCurrentLanguage();
    
  // Devolver siempre en español por defecto (manifest.default_locale = "es")
  return `El próximo episodio se emite el ${dateText} a las ${timeText}`;
  }

  getCurrentLanguage() {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('es')) return 'es';
    return 'en';
  }

  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null; // Clear reference
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Global instance to manage lifecycle
let currentEpisodeAirDateInstance = null;

function initializeEpisodeAirDate(seriesId) {
  // If an instance already exists, destroy it to prevent duplicates
  if (currentEpisodeAirDateInstance) {
    currentEpisodeAirDateInstance.destroy();
    currentEpisodeAirDateInstance = null;
  }

  if (!seriesId) {
    const pathMatch = location.pathname.match(/(?<=\/series\/)[^\/]*/);
    if (!pathMatch) return;
    seriesId = pathMatch[0];
    if (!seriesId) return;
  }

  console.log("Crunchyroll Power Up: Initializing EpisodeAirDate for series:", seriesId);
  
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

  currentEpisodeAirDateInstance = new EpisodeAirDate(seriesId, seasons, episodes);
}

// Exportar para uso en el content script
window.EpisodeAirDate = EpisodeAirDate;
window.initializeEpisodeAirDate = initializeEpisodeAirDate;

// No hay auto-inicialización aquí; content.js lo gestionará
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', initializeEpisodeAirDate);
// } else {
//   initializeEpisodeAirDate();
// }
