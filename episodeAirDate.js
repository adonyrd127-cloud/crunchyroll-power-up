// Funcionalidad de Fecha de Emisión del Episodio para Crunchyroll Power Up
// Basado en la implementación de Improve Crunchyroll (https://github.com/ThomasTavernier/Improve-Crunchyroll)
// Funciona SOLO en páginas /series/
console.log("Crunchyroll Power Up: Módulo Fecha de Emisión cargado");

class EpisodeAirDate {
  constructor() {
    this.container = null;
    this.actionButtons = null;

    // Extraer slug del pathname: /es/series/GEXYZ123/my-anime-slug → "my-anime-slug"
    this.seriesSlug = this.getSeriesSlugFromUrl();

    if (!this.seriesSlug) {
      console.warn("Crunchyroll Power Up: [AirDate] No se pudo extraer slug de la URL:", location.pathname);
      return;
    }

    console.log("Crunchyroll Power Up: [AirDate] Slug de serie:", this.seriesSlug);

    // Esperar a que el DOM tenga el contenedor de acciones
    this.actionButtons = document.querySelector('.erc-series-hero-actions');

    // Iniciar observador persistente para manejar navegación SPA y re-renderizados de React
    this.startObserver();
  }

  startObserver() {
    if (this._observer) return;

    const contentEl = document.getElementById('content') || document.body;

    this._observer = new MutationObserver((mutations) => {
      // 1. Si no tenemos el contenedor, buscarlo
      if (!this.actionButtons) {
        this.actionButtons = document.querySelector('.erc-series-hero-actions');
        if (this.actionButtons) {
          console.log("Crunchyroll Power Up: [AirDate] Contenedor encontrado");
          this.createElement();
        }
        return;
      }

      // 2. Si ya tenemos contenedor, verificar si nuestro elemento sigue ahí
      if (this.container && !document.contains(this.container)) {
        console.log("Crunchyroll Power Up: [AirDate] Elemento desapareció (React re-render?), re-inyectando...");
        this.container = null; // Reset para forzar creación
        // Verificar si el contenedor padre sigue existiendo
        if (!document.contains(this.actionButtons)) {
          this.actionButtons = document.querySelector('.erc-series-hero-actions');
        }
        if (this.actionButtons) {
          this.createElement();
        }
      }
    });

    this._observer.observe(contentEl, { childList: true, subtree: true });

    // Check inicial inmediato
    if (!this.actionButtons) {
      this.actionButtons = document.querySelector('.erc-series-hero-actions');
    }

    if (this.actionButtons) {
      this.createElement();
    }
  }
  /**
   * Extrae el slug de la serie desde la URL actual
   * Soporta: /series/ID/slug, /es/series/ID/slug, /pt-br/series/ID/slug
   */
  getSeriesSlugFromUrl() {
    const path = location.pathname;
    // Regex: (/idioma)?/series/ID/slug
    const match = path.match(/(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/series\/[^\/]+\/([^\/\?#]+)/i);
    return match ? match[1] : null;
  }

  createElement() {
    // Evitar duplicados
    if (document.querySelector('.next-air-date')) {
      console.log("Crunchyroll Power Up: [AirDate] Ya existe el elemento de fecha");
      return;
    }

    this.getAirDate((date) => {
      if (!date) return;

      const dateFormatted = Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        weekday: 'long',
        month: '2-digit',
      }).format(date);

      const timeFormatted = Intl.DateTimeFormat(undefined, {
        minute: '2-digit',
        hour: '2-digit',
      }).format(date);

      // Crear elemento
      this.container = document.createElement('p');
      this.container.className = 'next-air-date';
      this.container.style.cssText = 'color: #a5a5a5; font-size: 14px; margin-top: 8px;';

      // Intentar i18n, fallback a español
      let text = '';
      try {
        text = chrome.i18n.getMessage('nextEpisodeAirsAt', [dateFormatted, timeFormatted]);
      } catch (e) { }
      if (!text) {
        text = `El próximo episodio se emite el ${dateFormatted} a las ${timeFormatted}`;
      }
      this.container.textContent = text;

      // Inyectar en la página
      if (this.actionButtons) {
        this.actionButtons.append(this.container);
        console.log("Crunchyroll Power Up: [AirDate] Fecha inyectada correctamente:", text);
      }
    });
  }

  getAirDate(callback) {
    // Cache global
    if (!window.anilistCache) {
      window.anilistCache = {};
    }

    const cacheKey = this.seriesSlug;

    // Verificar caché
    if (window.anilistCache[cacheKey]?.nextAiringDate > new Date()) {
      console.log("Crunchyroll Power Up: [AirDate] Usando fecha cacheada");
      callback(window.anilistCache[cacheKey].nextAiringDate);
      return;
    }

    // Consultar AniList API via background script
    // El slug se usa como término de búsqueda (reemplazar guiones por espacios)
    const searchTerm = this.seriesSlug.replace(/-/g, ' ');
    console.log("Crunchyroll Power Up: [AirDate] Buscando en AniList:", searchTerm);

    chrome.runtime.sendMessage(chrome.runtime.id, {
      type: 'anilist',
      data: {
        query: `query {
          Media(search: "${searchTerm}", type: ANIME, status: RELEASING) {
            nextAiringEpisode {
              airingAt
            }
          }
        }`,
      },
    }, (response) => {
      try {
        const airingAt = response?.data?.Media?.nextAiringEpisode?.airingAt;

        if (!window.anilistCache[cacheKey]) {
          window.anilistCache[cacheKey] = {};
        }

        if (airingAt) {
          const airingDate = new Date(airingAt * 1000);
          window.anilistCache[cacheKey].nextAiringDate = airingDate;
          console.log("Crunchyroll Power Up: [AirDate] Fecha de AniList:", airingDate);
          callback(airingDate);
        } else {
          window.anilistCache[cacheKey].nextAiringDate = null;
          console.log("Crunchyroll Power Up: [AirDate] No hay próximo episodio en AniList para:", searchTerm);
          callback(null);
        }
      } catch (err) {
        console.error("Crunchyroll Power Up: [AirDate] Error procesando respuesta de AniList:", err);
        callback(null);
      }
    });
  }

  destroy() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }
}

// Global instance para gestionar el ciclo de vida
let currentEpisodeAirDateInstance = null;

function initializeEpisodeAirDate() {
  // Si ya existe una instancia, destruirla
  if (currentEpisodeAirDateInstance) {
    currentEpisodeAirDateInstance.destroy();
    currentEpisodeAirDateInstance = null;
  }

  // Solo funciona en páginas /series/ (con o sin prefijo de idioma)
  const isSeriesPage = /(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/series\//i.test(location.pathname);
  if (!isSeriesPage) {
    console.log("Crunchyroll Power Up: [AirDate] No es una página de serie, omitiendo");
    return;
  }

  console.log("Crunchyroll Power Up: [AirDate] Inicializando en página de serie");
  currentEpisodeAirDateInstance = new EpisodeAirDate();
}

function destroyEpisodeAirDate() {
  if (currentEpisodeAirDateInstance) {
    currentEpisodeAirDateInstance.destroy();
    currentEpisodeAirDateInstance = null;
  }
}

// Exportar para uso en content.js
window.EpisodeAirDate = EpisodeAirDate;
window.initializeEpisodeAirDate = initializeEpisodeAirDate;
window.destroyEpisodeAirDate = destroyEpisodeAirDate;
