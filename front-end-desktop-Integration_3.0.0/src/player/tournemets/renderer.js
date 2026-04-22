'use strict';

const { requireAuth, getUser, logout } = require('../../../shared/api');
const tournamentService = require('./tournamentService');

if (!requireAuth()) {
    console.warn('User not authenticated, redirecting...');
}

const state = {
    tournaments: [],
    search: '',
    bucket: 'all',
    games: [],
    selectedGameMode: 'PRO',
};

const BUCKET_LABELS = {
    all: 'All',
    active: 'Live',
    upcoming: 'Upcoming',
    completed: 'Ended',
};

function markTournamentNavActive() {
    const tournamentNav = document.getElementById('nav-page-tournaments');
    if (!tournamentNav) return;
    tournamentNav.classList.remove('text-gray-500');
    tournamentNav.classList.add('bg-[#00ff87]', 'text-[#0a0b0f]');
}

function statusBadgeConfig(status) {
    const config = {
        ONGOING: 'bg-red-500/10 text-red-500 border-red-500/20',
        OPEN_REGISTRATION: 'bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/20',
        UPCOMING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        COMPLETED: 'bg-white/5 text-white/40 border-white/10',
        BLOCKED: 'bg-red-500/10 text-red-500 border-red-500/20',
        PENDING_APPROVAL: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    };
    return config[status] || 'bg-white/5 text-white/40 border-white/10';
}

function formatDate(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'TBA';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function filteredTournaments() {
    return state.tournaments.filter((t) => {
        const matchesBucket = state.bucket === 'all' || t.bucket === state.bucket;
        const needle = state.search.trim().toLowerCase();
        const matchesSearch = !needle || 
            t.name.toLowerCase().includes(needle) || 
            t.gameTitle.toLowerCase().includes(needle);
        return matchesBucket && matchesSearch;
    });
}

function updateSummary() {
    document.getElementById('summary-total').textContent = state.tournaments.length;
    document.getElementById('summary-live').textContent = state.tournaments.filter(t => t.bucket === 'active').length;
    document.getElementById('summary-upcoming').textContent = state.tournaments.filter(t => t.bucket === 'upcoming').length;
}

function renderFilters() {
    const host = document.getElementById('bucket-filters');
    if (!host) return;
    host.innerHTML = '';

    Object.keys(BUCKET_LABELS).forEach((bucket) => {
        const active = state.bucket === bucket;
        const button = document.createElement('button');
        button.className = `px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            active ? 'bg-white/10 text-white border border-white/10 shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
        }`;
        button.textContent = BUCKET_LABELS[bucket];
        button.onclick = () => {
            state.bucket = bucket;
            renderFilters();
            renderList();
        };
        host.appendChild(button);
    });
}

function buildCard(t) {
    const card = document.createElement('article');
    card.className = 'group relative overflow-hidden rounded-[2rem] border border-white/5 bg-[#141419] transition-all hover:-translate-y-1 hover:border-[#00ff87]/30 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] animate-fade-in';
    
    const fill = t.maxTeams > 0 ? (t.currentTeams / t.maxTeams) * 100 : 0;
    const isLive = t.status === 'ONGOING';
    const statusBadge = statusBadgeConfig(t.status);

    card.innerHTML = `
        <div class="relative h-44 overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-[#1a1c26] to-[#0a0b0f]"></div>
            <div class="absolute inset-0 bg-gradient-to-t from-[#141419] via-transparent to-transparent opacity-80"></div>
            
            <div class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest ${statusBadge}">
                ${isLive ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>' : ''}
                ${t.status.replace(/_/g, ' ')}
            </div>
            
            <div class="absolute top-4 right-4 px-3 py-1.5 rounded-xl backdrop-blur-md bg-black/40 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                ${t.gameTitle}
            </div>

            <div class="absolute bottom-4 left-6 right-6">
                <p class="text-[9px] font-black uppercase tracking-widest text-[#00ff87] mb-1">${t.organizerName}</p>
                <h3 class="text-xl font-black text-white uppercase tracking-tight leading-tight group-hover:text-[#00ff87] transition-colors">${t.name}</h3>
            </div>
        </div>

        <div class="p-6 space-y-6">
            <div class="flex items-center gap-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                <div class="flex items-center gap-2"><i data-lucide="calendar" class="w-3 h-3 text-[#00ff87]"></i> ${formatDate(t.startDate)}</div>
                <div class="w-1 h-1 rounded-full bg-white/10"></div>
                <div class="flex items-center gap-2"><i data-lucide="users" class="w-3 h-3 text-[#00ff87]"></i> ${t.currentTeams}/${t.maxTeams} Teams</div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                    <span class="text-white/20">Registration Progress</span>
                    <span class="text-[#00ff87]">${Math.round(fill)}%</span>
                </div>
                <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-[#00ff87] to-[#00ff87]/40 rounded-full transition-all duration-700" style="width: ${fill}%"></div>
                </div>
            </div>

            <button class="view-details w-full py-3.5 rounded-2xl bg-white/5 border border-white/5 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#00ff87] hover:text-black hover:border-transparent transition-all">
                View Event Details
            </button>
        </div>
    `;

    card.querySelector('.view-details').onclick = () => {
        window.location.href = `./tournament_details.html?id=${t._id}`;
    };

    return card;
}

function renderList() {
    const host = document.getElementById('tournaments-grid');
    const empty = document.getElementById('empty-state');
    if (!host) return;

    const items = filteredTournaments();
    host.innerHTML = '';

    if (items.length === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        items.forEach(t => host.appendChild(buildCard(t)));
    }
    lucide.createIcons();
}

async function loadGames() {
    try {
        state.games = await tournamentService.fetchGames();
        const select = document.getElementById('form-game');
        if (!select) return;
        
        select.innerHTML = '<option value="" disabled selected>Select a game...</option>';
        state.games.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g._id;
            opt.textContent = g.title;
            opt.className = 'bg-[#141419]';
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load games:', err);
    }
}

function toggleCreateModal(show) {
    const modal = document.getElementById('create-modal');
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
        loadGames();
        document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
    } else {
        modal.classList.add('hidden');
    }
}

async function handleSubmit() {
    const btn = document.getElementById('btn-submit-create');
    const name = document.getElementById('form-name').value;
    const gameId = document.getElementById('form-game').value;
    const region = document.getElementById('form-region').value;
    const startDateRaw = document.getElementById('form-date').value;
    const user = getUser();

    if (!name || !gameId || !startDateRaw) {
        alert('Please fill in all required fields.');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = 'Deploying...';

        const startDate = new Date(startDateRaw);
        const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

        const payload = {
            name,
            gameId,
            organizerId: user?._id || user?.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            maxTeams: 16,
            format: 'SINGLE_ELIMINATION',
            type: 'OFFICIAL',
            rules: {
                region,
                gameMode: state.selectedGameMode,
            }
        };

        await tournamentService.createTournament(payload);
        alert('TOURNAMENT DEPLOYED SUCCESSFULLY');
        toggleCreateModal(false);
        init(); // Refresh list
    } catch (err) {
        console.error('Deployment failed:', err);
        alert('Deployment failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Tournament';
    }
}

async function init() {
    markTournamentNavActive();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.search = e.target.value;
            renderList();
        };
    }

    // Modal listeners
    document.getElementById('btn-open-create').onclick = () => toggleCreateModal(true);
    document.getElementById('btn-close-create').onclick = () => toggleCreateModal(false);
    document.getElementById('btn-cancel-create').onclick = () => toggleCreateModal(false);
    document.getElementById('create-modal-overlay').onclick = () => toggleCreateModal(false);
    document.getElementById('btn-submit-create').onclick = handleSubmit;

    // Game mode selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mode-btn').forEach(b => {
                b.classList.remove('bg-[#00ff88]', 'text-black');
                b.classList.add('bg-white/5', 'text-white');
            });
            btn.classList.remove('bg-white/5', 'text-white');
            btn.classList.add('bg-[#00ff88]', 'text-black');
            state.selectedGameMode = btn.dataset.mode;
        };
    });

    const featuredBtn = document.getElementById('featured-entry');
    if (featuredBtn) {
        featuredBtn.onclick = () => {
            const featured = state.tournaments.find(t => t.bucket === 'active') || state.tournaments[0];
            if (featured) window.location.href = `./tournament_details.html?id=${featured._id}`;
        };
    }

    try {
        state.tournaments = await tournamentService.fetchTournaments();
        updateSummary();
        renderFilters();
        renderList();

        const featured = state.tournaments.find(t => t.bucket === 'active') || state.tournaments[0];
        if (featured) {
            document.getElementById('featured-title').textContent = featured.name;
            document.getElementById('featured-copy').textContent = featured.description || 'Arena digital tournament event.';
            document.getElementById('featured-status').textContent = featured.status.replace(/_/g, ' ');
            document.getElementById('featured-prize').textContent = `$${Number(featured.prizePool || 0).toLocaleString()} PRIZE`;
        }
    } catch (error) {
        console.error('Node synchronization failed:', error);
        document.getElementById('tournaments-grid').innerHTML = `
            <div class="col-span-full py-20 text-center bg-red-500/5 border border-red-500/10 rounded-[2.5rem]">
                <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 opacity-20 mx-auto mb-4"></i>
                <h3 class="text-lg font-black uppercase text-red-500">Connection Error</h3>
                <p class="text-sm text-gray-500 mt-2">Unable to synchronize with the tournament controller.</p>
            </div>
        `;
        lucide.createIcons();
    }
}

init();
