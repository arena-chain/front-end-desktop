const { ipcRenderer, shell } = require('electron');
const { requireAuth, apiRequest, logout } = require('../../../shared/api');

if (!requireAuth()) {
    throw new Error('Not authenticated');
}

const CATEGORY_COLORS = {
    patch_notes: '#0bc6e3',
    esports:     '#ff4654',
    community:   '#a855f7',
    tech:        '#f59e0b',
    release:     '#00ff87',
    general:     '#6b7280',
};

const FALLBACK_IMAGES = [
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1560253023-3ec5d502959f?q=80&w=2070&auto=format&fit=crop',
];

const ALL_CATEGORIES = [
    { key: '',            label: 'All' },
    { key: 'esports',     label: 'Esports' },
    { key: 'patch_notes', label: 'Patch Notes' },
    { key: 'community',   label: 'Community' },
    { key: 'tech',        label: 'Tech' },
    { key: 'release',     label: 'Releases' },
    { key: 'general',     label: 'General' },
];

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let state = {
    items: [],
    featured: null,
    page: 1,
    totalPages: 1,
    total: 0,
    loading: false,
    category: '',
};

function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.max(0, now - then);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0)  return `${months} MONTH${months > 1 ? 'S' : ''} AGO`;
    if (weeks > 0)   return `${weeks} WEEK${weeks > 1 ? 'S' : ''} AGO`;
    if (days > 0)    return `${days} DAY${days > 1 ? 'S' : ''} AGO`;
    if (hours > 0)   return `${hours} HOUR${hours > 1 ? 'S' : ''} AGO`;
    if (minutes > 0) return `${minutes} MIN${minutes > 1 ? 'S' : ''} AGO`;
    return 'JUST NOW';
}

function readTime(text) {
    if (!text) return '1 MIN READ';
    const words = text.split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} MIN READ`;
}

function getCategoryColor(category) {
    return CATEGORY_COLORS[(category || '').toLowerCase()] || CATEGORY_COLORS.general;
}

function getFallbackImage(index) {
    return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

function formatCategory(category) {
    return (category || 'general').replace(/_/g, ' ');
}

function openArticle(article) {
    if (article.sourceUrl) {
        shell.openExternal(article.sourceUrl).catch(() => {});
    }
}

function renderHero(article) {
    const container = document.getElementById('featured-hero');
    if (!article) {
        container.innerHTML = '';
        return;
    }

    const img = article.coverImageUrl || FALLBACK_IMAGES[0];
    const cat = formatCategory(article.category);

    container.innerHTML = `
        <div class="w-full h-80 rounded-3xl overflow-hidden relative cursor-pointer group mb-10" id="hero-card">
            <div class="absolute inset-0 bg-gradient-to-r from-[#0a0b0f] via-[#12141c]/80 to-transparent z-10"></div>
            <div class="absolute inset-0 bg-gradient-to-br from-[#00ff87]/20 to-transparent z-10"></div>
            <img src="${img}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Featured News"
                 onerror="this.src='${FALLBACK_IMAGES[0]}'">
            <div class="absolute inset-0 z-20 flex flex-col justify-end p-10">
                <span class="px-3 py-1 bg-[#00ff87]/20 text-[#00ff87] text-xs font-bold rounded-lg border border-[#00ff87]/30 mb-4 inline-block w-max uppercase">${esc(cat)}</span>
                <h2 class="text-5xl font-black text-white mb-3 max-w-2xl leading-tight">${esc(article.title)}</h2>
                <p class="text-gray-300 max-w-xl text-lg mb-6">${esc(article.summary)}</p>
                <button class="px-8 py-3 bg-[#00ff87] text-[#0a0b0f] font-bold text-sm rounded-xl hover:bg-[#00e67a] transition-all w-max shadow-[0_0_20px_rgba(0,255,135,0.4)] hover:shadow-[0_0_30px_rgba(0,255,135,0.6)]">READ FULL ARTICLE</button>
            </div>
        </div>
    `;

    document.getElementById('hero-card').addEventListener('click', () => openArticle(article));
}

function renderCard(article, index) {
    const img = article.coverImageUrl || getFallbackImage(index);
    const color = getCategoryColor(article.category);
    const cat = formatCategory(article.category);
    const ago = timeAgo(article.publishedAt);
    const read = readTime(article.summary + ' ' + (article.content || ''));

    const card = document.createElement('div');
    card.className = 'news-card glass-panel rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full bg-[#12141c]';
    card.innerHTML = `
        <div class="h-48 overflow-hidden relative">
            <span class="absolute top-4 left-4 z-10 px-2 py-1 text-white text-[10px] font-bold rounded uppercase" style="background: ${color}e6">${esc(cat)}</span>
            <img src="${img}" class="w-full h-full object-cover" alt="${esc(article.title)}"
                 onerror="this.src='${getFallbackImage(index)}'">
        </div>
        <div class="p-6 flex-1 flex flex-col">
            <h3 class="text-xl font-bold text-white mb-2 leading-tight">${esc(article.title)}</h3>
            <p class="text-sm text-gray-400 mb-4 flex-1">${esc(article.summary)}</p>
            <div class="flex items-center justify-between text-xs text-gray-500 font-semibold mt-auto pt-4 border-t border-white/5">
                <span>${ago}</span>
                <span>${read}</span>
            </div>
        </div>
    `;
    card.addEventListener('click', () => openArticle(article));
    return card;
}

function renderGrid(items) {
    const grid = document.getElementById('news-grid');
    grid.innerHTML = '';
    if (items.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                <svg class="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
                </svg>
                <p class="text-lg font-semibold">No articles found</p>
                <p class="text-sm mt-1">Check back later for the latest updates</p>
            </div>
        `;
        return;
    }
    items.forEach((article, i) => grid.appendChild(renderCard(article, i)));
}

function renderLoadMore() {
    const container = document.getElementById('load-more-container');
    if (state.page >= state.totalPages) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <button id="load-more-btn" class="px-8 py-3 glass-panel text-[#00ff87] font-bold text-sm rounded-xl border border-[#00ff87]/30 hover:bg-[#00ff87]/10 transition-all">
            LOAD MORE (${Math.max(0, state.total - state.items.length - (state.featured ? 1 : 0))} remaining)
        </button>
    `;
    document.getElementById('load-more-btn').addEventListener('click', loadMore);
}

function showLoading(initial) {
    if (initial) {
        const grid = document.getElementById('news-grid');
        grid.innerHTML = Array.from({ length: 6 }, () => `
            <div class="news-card glass-panel rounded-2xl overflow-hidden flex flex-col h-full bg-[#12141c] animate-pulse">
                <div class="h-48 bg-white/5"></div>
                <div class="p-6 flex-1 flex flex-col gap-3">
                    <div class="h-5 bg-white/5 rounded w-3/4"></div>
                    <div class="h-4 bg-white/5 rounded w-full"></div>
                    <div class="h-4 bg-white/5 rounded w-2/3"></div>
                    <div class="flex justify-between mt-auto pt-4 border-t border-white/5">
                        <div class="h-3 bg-white/5 rounded w-20"></div>
                        <div class="h-3 bg-white/5 rounded w-16"></div>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('featured-hero').innerHTML = `
            <div class="w-full h-80 rounded-3xl overflow-hidden relative mb-10 bg-white/5 animate-pulse"></div>
        `;
    }
}

function renderFilters() {
    const container = document.getElementById('category-filters');
    container.innerHTML = ALL_CATEGORIES.map(cat => {
        const active = state.category === cat.key;
        const cls = active
            ? 'bg-[#00ff87]/20 text-[#00ff87] border-[#00ff87]/30'
            : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white';
        return `<button data-category="${cat.key}" class="filter-btn px-4 py-2 text-xs font-bold rounded-xl border transition-all ${cls}">${cat.label}</button>`;
    }).join('');

    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.category;
            if (cat !== state.category) {
                state.category = cat;
                state.page = 1;
                state.items = [];
                fetchNews(true);
            }
        });
    });
}

async function fetchNews(initial = false) {
    if (state.loading) return;
    state.loading = true;

    if (initial) showLoading(true);

    try {
        const params = new URLSearchParams();
        params.set('page', String(state.page));
        params.set('limit', '9');
        if (state.category) params.set('category', state.category);

        const data = await apiRequest(`/news?${params.toString()}`);

        if (initial) {
            const featured = data.items.find(a => a.isFeatured) || data.items[0] || null;
            state.featured = featured;
            const gridItems = featured ? data.items.filter(a => a._id !== featured._id) : data.items;
            state.items = gridItems;
        } else {
            const newItems = state.featured
                ? data.items.filter(a => a._id !== state.featured._id)
                : data.items;
            state.items = [...state.items, ...newItems];
        }

        state.totalPages = data.totalPages;
        state.total = data.total;

        renderHero(state.featured);
        renderGrid(state.items);
        renderFilters();
        renderLoadMore();
    } catch (err) {
        console.error('Failed to load news:', err);
        if (state.items.length === 0) {
            document.getElementById('news-grid').innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                    <svg class="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                    </svg>
                    <p class="text-lg font-semibold">Failed to load news</p>
                    <p class="text-sm mt-1">${esc(err.message) || 'Please check your connection and try again'}</p>
                    <button id="retry-btn" class="mt-4 px-6 py-2 bg-[#00ff87]/20 text-[#00ff87] font-bold text-sm rounded-xl border border-[#00ff87]/30 hover:bg-[#00ff87]/10 transition-all">
                        RETRY
                    </button>
                </div>
            `;
            document.getElementById('retry-btn')?.addEventListener('click', () => fetchNews(true));
        }
    } finally {
        state.loading = false;
    }
}

async function loadMore() {
    state.page += 1;
    await fetchNews(false);
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => { if (logout) logout(); });
}

// Boot
fetchNews(true);
