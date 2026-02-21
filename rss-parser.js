// ============================================
// RSS PARSER MODULE — Crunchyroll Power Up
// Standalone module for fetching, parsing, caching,
// and matching the Crunchyroll RSS feed.
// Loaded via importScripts() in background.js
// ============================================

const RSS_FEED_URL = 'https://feeds.feedburner.com/crunchyroll/rss/anime';
const RSS_CACHE_KEY = 'rssCache';
const TITLE_ALIASES_KEY = 'titleAliases';
const RSS_CACHE_TTL_MS = 15 * 60 * 1000;      // 15 minutes
const RSS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================
// FETCH & PARSE RSS
// ============================================

/**
 * Fetches the Crunchyroll RSS feed and parses it into structured items.
 * Uses regex-based XML parsing (DOMParser is NOT available in service workers).
 * @returns {Promise<Array<{seriesTitle: string, episodeNumber: number, title: string, link: string, pubDate: string, pubTimestamp: number, thumbnail: string}>>}
 */
async function fetchAndParseRSS() {
    console.log('📡 Fetching Crunchyroll RSS...');

    const response = await fetch(RSS_FEED_URL, {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' }
    });

    if (!response.ok) {
        throw new Error(`RSS fetch failed: HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const parsed = [];

    // Extract all <item>...</item> blocks using regex
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let itemMatch;
    let totalItems = 0;

    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
        totalItems++;
        const itemXml = itemMatch[1];

        const rawTitle = extractTag(itemXml, 'title');
        const link = extractTag(itemXml, 'link');
        const pubDate = extractTag(itemXml, 'pubDate');

        // Try crunchyroll-namespaced tags
        let seriesTitle = extractTag(itemXml, 'crunchyroll:seriesTitle') ||
            extractTag(itemXml, 'cr:seriesTitle') || '';
        let episodeNumber = parseInt(
            extractTag(itemXml, 'crunchyroll:episodeNumber') ||
            extractTag(itemXml, 'cr:episodeNumber') || '0', 10);

        // Fallback: parse from the <title> tag
        if (!seriesTitle || !episodeNumber) {
            const titleParsed = parseTitleString(rawTitle);
            if (!seriesTitle) seriesTitle = titleParsed.series;
            if (!episodeNumber) episodeNumber = titleParsed.episode;
        }

        // Get thumbnail from media:thumbnail
        let thumbnail = '';
        const thumbMatch = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ||
            itemXml.match(/<thumbnail[^>]+url=["']([^"']+)["']/i);
        if (thumbMatch) {
            thumbnail = thumbMatch[1];
        }

        const pubTimestamp = pubDate ? new Date(pubDate).getTime() : 0;

        if (seriesTitle) {
            parsed.push({
                seriesTitle,
                episodeNumber: episodeNumber || 0,
                title: rawTitle,
                link,
                pubDate,
                pubTimestamp,
                thumbnail
            });
        }
    }

    console.log(`📡 RSS parsed: ${parsed.length} items from ${totalItems} entries`);
    return parsed;
}

/**
 * Extracts text content from an XML tag using regex.
 * Handles both <tag>text</tag> and CDATA sections.
 */
function extractTag(xml, tagName) {
    // Escape special regex chars in tag name (for namespaced tags with colons)
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escaped}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${escaped}>`, 'i');
    const match = xml.match(regex);
    if (match) {
        return (match[1] || match[2] || '').trim();
    }
    return '';
}

/**
 * Parses a title string like "One Piece - Episode 1123" or "One Piece Episode 1123"
 * into { series, episode }.
 */
function parseTitleString(title) {
    // Pattern 1: "Series Name - Episode N" or "Series Name – Episode N"
    let match = title.match(/^(.+?)\s*[-–—]\s*(?:Episode|Ep\.?|#)\s*(\d+)/i);
    if (match) {
        return { series: match[1].trim(), episode: parseInt(match[2], 10) };
    }

    // Pattern 2: "Series Name Episode N"
    match = title.match(/^(.+?)\s+(?:Episode|Ep\.?)\s*(\d+)/i);
    if (match) {
        return { series: match[1].trim(), episode: parseInt(match[2], 10) };
    }

    // Pattern 3: "Series Name - N" (just a number after dash)
    match = title.match(/^(.+?)\s*[-–—]\s*(\d+)\s*$/);
    if (match) {
        return { series: match[1].trim(), episode: parseInt(match[2], 10) };
    }

    // Fallback: entire title is the series, no episode number detected
    return { series: title.trim(), episode: 0 };
}

// ============================================
// TITLE MATCHING
// ============================================

/**
 * Attempts to match an RSS series title against a list of saved anime titles.
 * Uses a 3-tier matching system + user-defined aliases.
 *
 * @param {string} rssTitle - The series title from the RSS feed
 * @param {Array<{title: string, id: string}>} savedAnimes - Followed animes with titles
 * @param {Object} aliases - User-defined alias map { rssTitle: savedTitle }
 * @returns {{ match: object|null, confidence: 'exact'|'partial'|'keyword'|'alias'|null }}
 */
function matchAnimeTitle(rssTitle, savedAnimes, aliases = {}) {
    if (!rssTitle || !savedAnimes?.length) return { match: null, confidence: null };

    const normalizedRss = normalizeTitle(rssTitle);

    // Check user-defined aliases first (highest priority for user corrections)
    if (aliases[normalizedRss]) {
        const aliasTarget = aliases[normalizedRss];
        const found = savedAnimes.find(a => normalizeTitle(a.title) === normalizeTitle(aliasTarget));
        if (found) return { match: found, confidence: 'alias' };
    }

    // Tier 1: Exact match (case-insensitive, normalized)
    for (const anime of savedAnimes) {
        if (normalizeTitle(anime.title) === normalizedRss) {
            return { match: anime, confidence: 'exact' };
        }
    }

    // Tier 2: Partial match (one contains the other)
    for (const anime of savedAnimes) {
        const normalizedSaved = normalizeTitle(anime.title);
        if (normalizedSaved.includes(normalizedRss) || normalizedRss.includes(normalizedSaved)) {
            return { match: anime, confidence: 'partial' };
        }
    }

    // Tier 3: Keyword overlap (≥60% of words match)
    const rssWords = extractKeywords(normalizedRss);
    let bestMatch = null;
    let bestScore = 0;

    for (const anime of savedAnimes) {
        const savedWords = extractKeywords(normalizeTitle(anime.title));
        const score = calculateKeywordOverlap(rssWords, savedWords);
        if (score >= 0.6 && score > bestScore) {
            bestScore = score;
            bestMatch = anime;
        }
    }

    if (bestMatch) {
        return { match: bestMatch, confidence: 'keyword' };
    }

    return { match: null, confidence: null };
}

/**
 * Normalizes a title for comparison: lowercase, remove special chars, collapse spaces.
 */
function normalizeTitle(title) {
    return (title || '')
        .toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[-–—:.,!?()[\]{}]/g, ' ')
        .replace(/\b(the|a|an|no|wa|ga)\b/gi, '')  // Remove common articles
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extracts meaningful keywords (words ≥ 2 chars).
 */
function extractKeywords(normalizedTitle) {
    return normalizedTitle.split(' ').filter(w => w.length >= 2);
}

/**
 * Calculates bidirectional keyword overlap ratio.
 * Returns the average of (shared/set1) and (shared/set2).
 */
function calculateKeywordOverlap(words1, words2) {
    if (!words1.length || !words2.length) return 0;
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    let shared = 0;
    for (const w of set1) {
        if (set2.has(w)) shared++;
    }
    // Bidirectional: average coverage of both sets
    return ((shared / set1.size) + (shared / set2.size)) / 2;
}

// ============================================
// RSS CACHE
// ============================================

/**
 * Returns cached RSS items if the cache is fresh (< RSS_CACHE_TTL_MS).
 * @returns {Promise<{items: Array, timestamp: number}|null>}
 */
async function getCachedRSS() {
    try {
        const data = await chrome.storage.local.get(RSS_CACHE_KEY);
        const cache = data[RSS_CACHE_KEY];
        if (!cache || !cache.timestamp || !cache.items) return null;

        const age = Date.now() - cache.timestamp;
        if (age > RSS_CACHE_TTL_MS) {
            console.log(`📡 RSS cache expired (${Math.round(age / 60000)}min old)`);
            return null;
        }

        console.log(`📡 RSS cache hit (${Math.round(age / 60000)}min old, ${cache.items.length} items)`);
        return cache;
    } catch (e) {
        console.warn('RSS cache read error:', e);
        return null;
    }
}

/**
 * Stores parsed RSS items in the cache, evicting entries older than 7 days.
 * @param {Array} items - Parsed RSS items
 */
async function setCachedRSS(items) {
    try {
        // Evict old entries (> 7 days)
        const now = Date.now();
        const freshItems = items.filter(item =>
            item.pubTimestamp && (now - item.pubTimestamp) < RSS_MAX_AGE_MS
        );

        await chrome.storage.local.set({
            [RSS_CACHE_KEY]: {
                items: freshItems,
                timestamp: now
            }
        });

        console.log(`📡 RSS cache updated: ${freshItems.length} items stored`);
    } catch (e) {
        console.warn('RSS cache write error:', e);
    }
}

// ============================================
// GET EPISODES FOR ANIME
// ============================================

/**
 * Filters and returns RSS episodes that match a given anime.
 * @param {string} animeTitle - Title of the anime to search for
 * @param {Array} rssItems - Parsed RSS items
 * @param {Array} savedAnimes - All followed animes (for matching context)
 * @param {Object} aliases - User alias map
 * @returns {Array} Matching episodes sorted by episodeNumber descending
 */
function getEpisodesForAnime(animeTitle, rssItems, savedAnimes, aliases = {}) {
    if (!rssItems?.length) return [];

    const targetAnime = savedAnimes.find(a => a.title === animeTitle);
    if (!targetAnime) return [];

    const matches = [];

    for (const item of rssItems) {
        const result = matchAnimeTitle(item.seriesTitle, [targetAnime], aliases);
        if (result.match) {
            matches.push(item);
        }
    }

    // Sort by episode number descending (newest first)
    matches.sort((a, b) => b.episodeNumber - a.episodeNumber);
    return matches;
}

/**
 * Fetches RSS items, using cache when available.
 * @returns {Promise<{items: Array, fromCache: boolean, error: string|null}>}
 */
async function getOrFetchRSS() {
    // Try cache first
    const cached = await getCachedRSS();
    if (cached) {
        return { items: cached.items, fromCache: true, error: null };
    }

    // Fetch fresh
    try {
        const items = await fetchAndParseRSS();
        await setCachedRSS(items);
        return { items, fromCache: false, error: null };
    } catch (error) {
        console.error('📡 RSS fetch error:', error.message);
        return { items: [], fromCache: false, error: error.message };
    }
}

/**
 * Loads user-defined title aliases from storage.
 * @returns {Promise<Object>} Map of { normalizedRssTitle: savedTitle }
 */
async function getTitleAliases() {
    try {
        const data = await chrome.storage.local.get(TITLE_ALIASES_KEY);
        return data[TITLE_ALIASES_KEY] || {};
    } catch (e) {
        return {};
    }
}

console.log('📡 RSS Parser module loaded');
