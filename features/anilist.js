// features/anilist.js

class AnilistButtonHandler {
    constructor() {
        this.button = null;
        this.modal = null;
        this.observer = null;
        this.cache = {};
    }

    init() {
        console.log("🔵 AniList: Inicializando botón de AniList");
        this.loadCache();
        this.waitForShareButton();
    }

    destroy() {
        console.log("🔵 AniList: Destruyendo botón y modal de AniList");
        if (this.button) {
            this.button.remove();
            this.button = null;
        }
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    loadCache() {
        const cachedData = localStorage.getItem('anilistCache');
        if (cachedData) {
            this.cache = JSON.parse(cachedData);
        }
    }

    saveCache() {
        localStorage.setItem('anilistCache', JSON.stringify(this.cache));
    }

    waitForShareButton() {
        const targetSelector = '.erc-series-hero-actions';

        const initObserver = () => {
            const targetNode = document.querySelector(targetSelector);
            if (!targetNode) {
                // Si el nodo objetivo no existe, esperar un poco y reintentar.
                setTimeout(initObserver, 500);
                return;
            }

            this.observer = new MutationObserver(() => {
                // Buscar el botón de compartir por cualquiera de sus posibles etiquetas.
                const shareButton = targetNode.querySelector('button[aria-label="Compartir"], button[aria-label="Share"]');
                if (shareButton && !this.button) {
                    this.injectButton(shareButton);
                }
            });

            this.observer.observe(targetNode, { childList: true, subtree: true });

            // Comprobación inicial en caso de que el botón ya esté presente.
            const shareButton = targetNode.querySelector('button[aria-label="Compartir"], button[aria-label="Share"]');
            if (shareButton) {
                this.injectButton(shareButton);
            }
        };

        initObserver();
    }

    injectButton(shareButton) {
        if (this.button) return;

        const container = shareButton.parentElement;
        if (!container) return;

        this.button = document.createElement('button');
        this.button.className = 'anilist-button';
        this.button.setAttribute('aria-label', 'Ver detalles en AniList');
        this.button.setAttribute('title', 'Ver detalles en AniList');
        this.button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20" height="20" role="img" aria-label="AL logo">
              <rect width="100%" height="100%" fill="#19212d" />
              <rect x="300" y="90" width="120" height="270" rx="22" ry="22" fill="#00aaff"/>
              <rect x="350" y="350" width="162" height="60" rx="22" ry="22" fill="#00aaff"/>
              <path fill="#fefefe" fill-rule="evenodd" d=" M 80 400 L 145 155 L 245 155 L 310 400 L 240 400 L 220 330 L 140 330 L 120 400 Z M 195 210 L 170 280 L 220 280 Z "/>
              <rect x="0" y="0" width="512" height="512" fill-opacity="0" />
            </svg>
        `;

        container.insertBefore(this.button, shareButton.nextSibling);

        this.button.addEventListener('click', () => this.handleButtonClick());
    }

    async handleButtonClick() {
        // Secuencia de selectores para encontrar el título de la forma más robusta posible.
        const selectors = [
            '[data-testid="series-title"] h1',
            'h1[itemprop="name"]',
            'h1.title'
        ];

        let titleElement = null;
        for (const selector of selectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) {
                console.log(`🔵 AniList: Título encontrado con el selector: "${selector}"`);
                break;
            }
        }

        if (!titleElement) {
            console.error('🔵 AniList: No se pudo encontrar el título del anime con ninguno de los selectores.');
            this.showModal(null, "No se pudo encontrar el título del anime en la página.");
            return;
        }
        const animeTitle = titleElement.textContent.trim();

        if (this.cache[animeTitle]) {
            console.log('🔵 AniList: Mostrando datos desde la caché.');
            this.showModal(this.cache[animeTitle]);
            return;
        }

        const data = await this.fetchAniListData(animeTitle);
        if (data) {
            this.cache[animeTitle] = data;
            this.saveCache();
        }
        this.showModal(data, `No se encontraron resultados para "${animeTitle}" en AniList.`);
    }

    async fetchAniListData(search) {
        const query = `
            query ($search: String) {
              Media(search: $search, type: ANIME) {
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  large
                }
                description(asHtml: false)
                averageScore
                genres
                episodes
                season
                seasonYear
                siteUrl
              }
            }
        `;

        const variables = {
            search: search
        };

        const url = 'https://graphql.anilist.co';
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        };

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            return data.data.Media;
        } catch (error) {
            console.error('🔵 AniList: Error al consultar la API de AniList:', error);
            return null;
        }
    }

    showModal(data, errorMessage = "Ocurrió un error inesperado.") {
        if (this.modal) {
            this.modal.remove();
        }

        this.modal = document.createElement('div');
        this.modal.className = 'anilist-modal';

        let modalContentHTML = '';

        if (data) {
            const description = data.description?.length > 400
                ? data.description.substring(0, 400) + '...'
                : data.description || 'No hay descripción disponible.';

            modalContentHTML = `
                <div class="anilist-modal-header">
                    <img src="${data.coverImage?.large}" alt="Cover Image" class="anilist-modal-cover">
                    <div class="anilist-modal-title">
                        <h2>${data.title?.romaji || data.title?.english || 'Título no disponible'}</h2>
                        <p>${data.title?.native || ''}</p>
                    </div>
                </div>
                <div class="anilist-modal-body">
                    <p class="anilist-modal-description">${description}</p>
                    <div class="anilist-modal-details">
                        <p><strong>Puntuación:</strong> ${data.averageScore ? `${data.averageScore} / 100` : 'N/A'}</p>
                        <p><strong>Géneros:</strong> ${data.genres?.join(', ') || 'N/A'}</p>
                        <p><strong>Episodios:</strong> ${data.episodes || 'N/A'}</p>
                        <p><strong>Temporada:</strong> ${data.season ? `${data.season} ${data.seasonYear}` : 'N/A'}</p>
                    </div>
                </div>
                <div class="anilist-modal-footer">
                    <a href="${data.siteUrl}" target="_blank" class="anilist-modal-button">Ver en AniList</a>
                </div>
            `;
        } else {
            modalContentHTML = `
                <div class="anilist-modal-body" style="text-align: center; padding: 40px;">
                    <h2>Error</h2>
                    <p>${errorMessage}</p>
                </div>
            `;
        }

        this.modal.innerHTML = `
            <div class="anilist-modal-content">
                <button class="anilist-modal-close">&times;</button>
                ${modalContentHTML}
            </div>
        `;

        document.body.appendChild(this.modal);

        this.modal.querySelector('.anilist-modal-close').addEventListener('click', () => {
            this.modal.remove();
            this.modal = null;
        });

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.modal.remove();
                this.modal = null;
            }
        });
    }
}
