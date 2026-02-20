/**
 * MANAGE ANIMES MODAL - JavaScript
 * Full-screen anime management with search, filters, sorting, and views.
 */

// ============================================
// GLOBAL STATE
// ============================================

let allAnimes = [];
let filteredAnimes = [];
let currentView = 'grid';
let currentSort = 'recent';
let searchQuery = '';

// ============================================
// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Manage Animes: Inicializando...');

    await loadAllAnimes();
    setupEventListeners();
    // The following lines are removed as per instruction:
    // applyFiltersAndSearch();
    // document.getElementById('loadingState').style.display = 'none';
});

// ============================================
// LOAD ANIMES
// ============================================

async function loadAllAnimes() {
    try {
        const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');
        allAnimes = followedAnimes;

        console.log(`✅ ${allAnimes.length} animes cargados`);
        applyFiltersAndSearch();
        updateStats();

    } catch (error) {
        console.error('Error cargando animes:', error);
        document.getElementById('animesGrid').innerHTML = '<p class="error">Error al cargar los animes.</p>';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Close modal
    document.getElementById('closeModalBtn')?.addEventListener('click', () => {
        window.close();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.close();
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.trim().toLowerCase();

            const clearBtn = document.getElementById('clearSearchBtn');
            clearBtn.style.display = searchQuery ? 'block' : 'none';

            applyFiltersAndSearch();
        }, 200); // debounce 200ms
    });

    // Clear search
    document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        document.getElementById('clearSearchBtn').style.display = 'none';
        applyFiltersAndSearch();
        searchInput.focus();
    });

    // Toggle filters panel
    document.getElementById('filterBtn')?.addEventListener('click', () => {
        const panel = document.getElementById('filterPanel');
        const btn = document.getElementById('filterBtn');

        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'block';
            btn.classList.add('active');
        } else {
            panel.style.display = 'none';
            btn.classList.remove('active');
        }
    });

    // Apply filters
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        applyFiltersAndSearch();
        document.getElementById('filterPanel').style.display = 'none';
        document.getElementById('filterBtn').classList.remove('active');
    });

    // Clear filters
    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        const watchingCb = document.querySelector('input[name="filter-status"][value="watching"]');
        if (watchingCb) watchingCb.checked = true;

        applyFiltersAndSearch();
    });

    // Sorting
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSearch();
    });

    // View: Grid
    document.getElementById('gridViewBtn')?.addEventListener('click', () => {
        currentView = 'grid';
        document.getElementById('gridViewBtn').classList.add('active');
        document.getElementById('listViewBtn').classList.remove('active');
        document.getElementById('animesGrid').classList.remove('list-view');
        renderAnimes();
    });

    // View: List
    document.getElementById('listViewBtn')?.addEventListener('click', () => {
        currentView = 'list';
        document.getElementById('listViewBtn').classList.add('active');
        document.getElementById('gridViewBtn').classList.remove('active');
        document.getElementById('animesGrid').classList.add('list-view');
        renderAnimes();
    });
}

// ============================================
// FILTER & SEARCH
// ============================================

function applyFiltersAndSearch() {
    // Get active filter checkboxes
    const activeStatuses = Array.from(
        document.querySelectorAll('input[name="filter-status"]:checked')
    ).map(cb => cb.value);

    const activeEpisodeFilters = Array.from(
        document.querySelectorAll('input[name="filter-episodes"]:checked')
    ).map(cb => cb.value);

    // Update filter badge
    const totalActive = activeStatuses.length + activeEpisodeFilters.length;
    const filterBadge = document.getElementById('filterBadge');
    if (totalActive > 0) {
        filterBadge.textContent = totalActive;
        filterBadge.style.display = 'inline-block';
    } else {
        filterBadge.style.display = 'none';
    }

    // Filter
    filteredAnimes = allAnimes.filter(anime => {
        // Text search
        if (searchQuery) {
            const titleMatch = anime.title?.toLowerCase().includes(searchQuery);
            if (!titleMatch) return false;
        }

        // Episode filters
        if (activeEpisodeFilters.includes('new') && !anime.hasNewEpisode) {
            return false;
        }

        return true;
    });

    // Sort
    sortAnimes();

    // Render
    renderAnimes();
    updateStats();
}

// ============================================
// SORTING
// ============================================

function sortAnimes() {
    switch (currentSort) {
        case 'recent':
            filteredAnimes.sort((a, b) => (b.addedDate || 0) - (a.addedDate || 0));
            break;
        case 'alphabetical':
            filteredAnimes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
        case 'episodes':
            filteredAnimes.sort((a, b) => (b.lastEpisode || 0) - (a.lastEpisode || 0));
            break;
        case 'new':
            filteredAnimes.sort((a, b) => {
                if (a.hasNewEpisode && !b.hasNewEpisode) return -1;
                if (!a.hasNewEpisode && b.hasNewEpisode) return 1;
                return (b.addedDate || 0) - (a.addedDate || 0);
            });
            break;
    }
}

// ============================================
// RENDER
// ============================================

function renderAnimes() {
    const grid = document.getElementById('animesGrid');
    const emptyResults = document.getElementById('emptyResults');

    if (filteredAnimes.length === 0) {
        grid.style.display = 'none';
        emptyResults.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyResults.style.display = 'none';

    // Clear grid
    grid.innerHTML = '';

    // Create cards
    filteredAnimes.forEach(anime => {
        const card = createAnimeCard(anime);
        grid.appendChild(card);
    });
}

function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.dataset.animeId = anime.id;

    const hasNew = anime.newEpisodes > 0 || anime.hasNewEpisode;
    let countText = anime.newEpisodes > 0 ? anime.newEpisodes : 'NUEVO';

    if (hasNew) {
        card.classList.add('has-new');
    }

    if (currentView === 'list') {
        card.innerHTML = `
            <div class="anime-card-image">
                <img
                    src="${anime.thumbnail || 'icons/icono chrome.png'}"
                    alt="${anime.title || 'Anime'}"
                    onerror="this.src='icons/icono chrome.png'"
                >
            </div>
            <div class="anime-card-content">
                <div class="anime-card-info">
                    <h3 class="anime-card-title" title="${anime.title || ''}">
                        ${anime.title || 'Sin título'}
                        ${hasNew ? `<span class="list-new-badge">${countText}</span>` : ''}
                    </h3>
                    <p class="anime-card-episode ${hasNew ? 'new-ep' : ''}">
                        Episodio ${anime.lastEpisode || '?'}
                    </p>
                </div>
                <div class="anime-card-actions">
                    <button class="anime-card-btn watch" data-url="${anime.url}">▶️ Ver</button>
                    <button class="anime-card-btn unfollow" data-id="${anime.id}">🔕 Dejar de seguir</button>
                </div>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="anime-card-image">
                <img
                    src="${anime.thumbnail || 'icons/icono chrome.png'}"
                    alt="${anime.title || 'Anime'}"
                    onerror="this.src='icons/icono chrome.png'"
                >
                ${hasNew ? `<div class="anime-card-badge">${countText}</div>` : ''}
            </div>
            <div class="anime-card-content">
                <h3 class="anime-card-title" title="${anime.title || ''}">${anime.title || 'Sin título'}</h3>
                <p class="anime-card-episode ${hasNew ? 'new-ep' : ''}">
                    Episodio ${anime.lastEpisode || '?'}
                </p>
                <div class="anime-card-actions">
                    <button class="anime-card-btn watch" data-url="${anime.url}">▶️ Ver</button>
                    <button class="anime-card-btn unfollow" data-id="${anime.id}">🔕 Dejar</button>
                </div>
            </div>
        `;
    }

    // Event listeners
    card.querySelector('.watch')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.dataset.url;
        if (url) {
            chrome.tabs.create({ url });
        }
    });

    card.querySelector('.unfollow')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const animeId = e.currentTarget.dataset.id;
        await unfollowAnime(animeId, card);
    });

    return card;
}

// ============================================
// ACTIONS
// ============================================

async function unfollowAnime(animeId, cardElement) {
    const anime = allAnimes.find(a => a.id === animeId);
    const title = anime?.title || 'el anime';

    if (!confirm(`¿Seguro que quieres dejar de seguir "${title}"?`)) {
        return;
    }

    try {
        const { followedAnimes = [] } = await chrome.storage.sync.get('followedAnimes');
        const updated = followedAnimes.filter(a => a.id !== animeId);
        await chrome.storage.sync.set({ followedAnimes: updated });

        // Animate card removal
        if (cardElement) {
            cardElement.style.transition = 'all 0.3s ease';
            cardElement.style.transform = 'scale(0.8)';
            cardElement.style.opacity = '0';

            await new Promise(r => setTimeout(r, 300));
        }

        // Update local data
        allAnimes = updated;
        applyFiltersAndSearch();

        showToast(`❌ Dejaste de seguir "${title}"`);
        console.log(`✅ Anime "${title}" eliminado de seguimiento`);

    } catch (error) {
        console.error('Error al dejar de seguir:', error);
        showToast('❌ Error al actualizar');
    }
}

// ============================================
// UPDATE STATS
// ============================================

function updateStats() {
    document.getElementById('totalAnimesCount').textContent = allAnimes.length;
    document.getElementById('displayedAnimesCount').textContent = filteredAnimes.length;

    const newCount = allAnimes.filter(a => a.hasNewEpisode).length;
    document.getElementById('newEpisodesCount').textContent = newCount;
}

// ============================================
// TOAST
// ============================================

function showToast(message) {
    let toast = document.querySelector('.modal-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'modal-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('visible');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

console.log('📋 Manage Animes Modal: Script cargado');
