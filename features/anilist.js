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
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        this.observer = new MutationObserver((mutationsList, observer) => {
            const shareButton = document.querySelector('button[aria-label="Compartir"]');
            if (shareButton) {
                this.injectButton(shareButton);
                observer.disconnect();
            }
        });

        this.observer.observe(targetNode, config);
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12.96,2.69a1.2,1.2,0,0,0-1.92,0L2.7,16.51,2.22,15a1.2,1.2,0,0,0-2.16,1.2l1.2,4.8a1.2,1.2,0,0,0,1.2,1.2H10.8a1.2,1.2,0,1,0,0-2.4H5.85l7.99-12.01a1.2,1.2,0,0,0,0-1.2ZM21.78,8,14.22,20.06a1.2,1.2,0,1,1-1.92-1.44L20.25,5.21l.48,1.93a1.2,1.2,0,0,0,2.16-1.2Z"></path>
            </svg>
        `;

        container.insertBefore(this.button, shareButton.nextSibling);

        this.button.addEventListener('click', () => this.handleButtonClick());
    }

    async handleButtonClick() {
        const titleElement = document.querySelector('h1.title');
        if (!titleElement) {
            console.error('🔵 AniList: No se pudo encontrar el título del anime.');
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
            this.showModal(data);
        }
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

    showModal(data) {
        if (this.modal) {
            this.modal.remove();
        }

        this.modal = document.createElement('div');
        this.modal.className = 'anilist-modal';

        const description = data.description.length > 400
            ? data.description.substring(0, 400) + '...'
            : data.description;

        this.modal.innerHTML = `
            <div class="anilist-modal-content">
                <button class="anilist-modal-close">&times;</button>
                <div class="anilist-modal-header">
                    <img src="${data.coverImage.large}" alt="Cover Image" class="anilist-modal-cover">
                    <div class="anilist-modal-title">
                        <h2>${data.title.romaji || data.title.english}</h2>
                        <p>${data.title.native}</p>
                    </div>
                </div>
                <div class="anilist-modal-body">
                    <p class="anilist-modal-description">${description}</p>
                    <div class="anilist-modal-details">
                        <p><strong>Puntuación:</strong> ${data.averageScore} / 100</p>
                        <p><strong>Géneros:</strong> ${data.genres.join(', ')}</p>
                        <p><strong>Episodios:</strong> ${data.episodes}</p>
                        <p><strong>Temporada:</strong> ${data.season} ${data.seasonYear}</p>
                    </div>
                </div>
                <div class="anilist-modal-footer">
                    <a href="${data.siteUrl}" target="_blank" class="anilist-modal-button">Ver en AniList</a>
                </div>
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
