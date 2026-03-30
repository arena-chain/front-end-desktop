const { ipcRenderer } = require('electron');
const { requireAuth, apiRequest, logout, getUser } = require('../../../shared/api');

if (!requireAuth()) throw new Error('Not authenticated');

const user = getUser();

// ── State ───────────────────────────────────────────────────────────────

const GAMES = [
    { key: 'all', label: 'All Games' },
    { key: 'val', label: 'Valorant', color: '#ff4654', icon: 'V' },
    { key: 'lol', label: 'League of Legends', color: '#0bc6e3', icon: 'LoL' },
];

const GAME_COLORS = { val: '#ff4654', lol: '#0bc6e3' };

const LOL_CHAMPION_ICON = (name) =>
    `https://ddragon.leagueoflegends.com/cdn/14.10.1/img/champion/${name}.png`;

const VAL_AGENT_ICONS = {
    '5f8d3a7f-467b-97f3-062c-13acf203c006': 'Breach',
    'f94c3b30-42be-e959-889c-5aa313dba261': 'Raze',
    '22697a3d-45bf-8dd7-4fec-84a9e28c69d7': 'Chamber',
    '601dbbe7-43ce-be57-2a40-4abd24953621': 'KAY/O',
    '6f2a04ca-43e0-be17-7f36-b3908627744d': 'Skye',
    '117ed9e3-49f3-6571-2054-a1eb71c64e48': 'Cypher',
    'ded3520f-4264-bfed-162d-b080e2abccf9': 'Sova',
    '320b2a48-4d9b-a075-30f1-1f93a9b638fa': 'Sova',
    '1e58de9c-4950-5125-93e9-a0aee9f98746': 'Killjoy',
    'bb2a4828-46eb-8cd1-e765-15848195d751': 'Neon',
    '7f94d92c-4234-0a36-9646-3a87eb8b5c89': 'Yoru',
    '569fdd95-4d10-43ab-ca70-79becc718b46': 'Sage',
    'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc': 'Reyna',
    'e370fa57-4757-3604-3648-499e1f642d3f': 'Gekko',
    'cc8b64c8-4b25-4ff3-9578-e6b8dda98c60': 'Deadlock',
    '0e38b510-41a8-5780-5e8f-568b2a4f2d6c': 'Iso',
    '1dbf2edd-4729-0984-3115-daa5eed44993': 'Clove',
    'eb93336a-449b-9c1b-0a54-a891f7921d69': 'Phoenix',
    '41fb69c1-4189-7b37-f117-bcaf1e96f1bf': 'Astra',
    '9f0d8ba9-4140-b941-57d3-a7ad57c6b417': 'Brimstone',
    '707eab51-4836-f488-046a-cda6bf494f0a': 'Viper',
    'dade69b4-4f5a-8528-247b-219e5a1facd6': 'Fade',
    '95b78ed7-4637-86d9-7e41-71ba8c293152': 'Harbor',
    'add6443a-41bd-e414-f6ad-e58d267f4e95': 'Jett',
    '8e253930-4c05-31dd-1b6c-968525494517': 'Omen',
};

let state = {
    filter: 'all',
    matches: [],
    loading: false,
    start: 0,
    count: 10,
    hasMore: true,
    linkStatus: null,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(ts) {
    if (!ts) return '';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMs(ms) {
    return formatDuration(Math.floor((ms || 0) / 1000));
}

function getAgentName(characterId) {
    return VAL_AGENT_ICONS[characterId] || 'Agent';
}

// ── Rendering ───────────────────────────────────────────────────────────

function renderFilters() {
    const container = document.getElementById('game-filters');
    if (!container) return;

    container.innerHTML = GAMES.map(g => {
        const active = state.filter === g.key;
        return `
            <button data-game="${g.key}"
                class="filter-btn px-4 py-2 font-semibold text-sm rounded-lg transition-all border
                    ${active ? 'active border-white/10' : 'bg-transparent hover:bg-white/5 text-gray-400 border-transparent'}">
                ${esc(g.label)}
            </button>
        `;
    }).join('');

    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.filter = btn.dataset.game;
            state.matches = [];
            state.start = 0;
            state.hasMore = true;
            renderFilters();
            fetchMatches(true);
        });
    });
}

function renderLolCard(m) {
    const isWin = m.win;
    const glowClass = isWin ? 'win-glow' : 'loss-glow';
    const resultLabel = isWin ? 'VICTORY' : 'DEFEAT';
    const resultColor = isWin ? '#00ff87' : '#ff4654';
    const resultBg = isWin ? 'bg-[#00ff87]/20 text-[#00ff87]' : 'bg-[#ff4654]/20 text-[#ff4654]';
    const champIcon = m.championName ? LOL_CHAMPION_ICON(m.championName) : '';

    const queueNames = {
        CLASSIC: 'Ranked',
        ARAM: 'ARAM',
        URF: 'URF',
    };
    const mode = queueNames[m.gameMode] || m.gameMode || 'Normal';

    return `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-5 hover:bg-white/5 transition-all cursor-pointer ${glowClass}" data-match-id="${esc(m.matchId)}">
            <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-[#0bc6e3]/30">
                ${champIcon
                    ? `<img src="${champIcon}" alt="${esc(m.championName)}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-[#0bc6e3]/10 flex items-center justify-center\\'><span class=\\'text-xl font-black text-[#0bc6e3]\\'>LoL</span></div>'">`
                    : `<div class="w-full h-full bg-[#0bc6e3]/10 flex items-center justify-center"><span class="text-xl font-black text-[#0bc6e3]">LoL</span></div>`
                }
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${resultBg}">${resultLabel}</span>
                    <span class="text-sm font-bold text-white">League of Legends • ${esc(mode)}</span>
                </div>
                <p class="text-xs text-gray-500">
                    ${m.championName ? esc(m.championName) + ' • ' : ''}${formatDuration(m.duration)} • ${timeAgo(m.gameCreation)}
                </p>
            </div>
            <div class="flex items-center gap-6 lg:gap-10 pr-2">
                <div class="text-center hidden sm:block">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">K / D / A</p>
                    <p class="text-sm font-black text-white">${m.kills} / ${m.deaths} / ${m.assists}</p>
                </div>
                <div class="text-center hidden md:block">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">KDA</p>
                    <p class="text-sm font-black" style="color: ${resultColor}">${esc(m.kda)}</p>
                </div>
                <div class="text-center">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Game</p>
                    <p class="text-xs font-bold text-[#0bc6e3]">LoL</p>
                </div>
            </div>
        </div>
    `;
}

function renderValCard(m) {
    const isWin = m.win;
    const glowClass = isWin ? 'win-glow' : 'loss-glow';
    const resultLabel = isWin ? 'VICTORY' : 'DEFEAT';
    const resultBg = isWin ? 'bg-[#00ff87]/20 text-[#00ff87]' : 'bg-[#ff4654]/20 text-[#ff4654]';
    const resultColor = isWin ? '#00ff87' : '#ff4654';
    const agentName = getAgentName(m.characterId);
    const score = `${m.roundsWon} - ${m.roundsLost}`;

    return `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-5 hover:bg-white/5 transition-all cursor-pointer ${glowClass}" data-match-id="${esc(m.matchId)}">
            <div class="w-14 h-14 rounded-xl bg-[#ff4654]/10 flex items-center justify-center flex-shrink-0 ring-2 ring-[#ff4654]/30">
                <span class="text-lg font-black text-[#ff4654]">V</span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${resultBg}">${resultLabel}</span>
                    <span class="text-sm font-bold text-white">Valorant • ${esc(m.gameMode === '/Game/GameModes/Bomb/BombGameMode' || m.gameMode === 'Bomb' ? 'Competitive' : m.gameMode)}</span>
                </div>
                <p class="text-xs text-gray-500">
                    ${esc(agentName)} • ${esc(m.map)} • ${score} • ${timeAgo(m.gameCreation)}
                </p>
            </div>
            <div class="flex items-center gap-6 lg:gap-10 pr-2">
                <div class="text-center hidden sm:block">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">K / D / A</p>
                    <p class="text-sm font-black text-white">${m.kills} / ${m.deaths} / ${m.assists}</p>
                </div>
                <div class="text-center hidden md:block">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Score</p>
                    <p class="text-sm font-black" style="color: ${resultColor}">${m.score}</p>
                </div>
                <div class="text-center">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Game</p>
                    <p class="text-xs font-bold text-[#ff4654]">VAL</p>
                </div>
            </div>
        </div>
    `;
}

function renderMatchCard(m) {
    return m.gameType === 'val' ? renderValCard(m) : renderLolCard(m);
}

function renderMatches() {
    const list = document.getElementById('match-list');
    if (!list) return;

    if (state.loading && state.matches.length === 0) {
        list.innerHTML = Array.from({ length: 4 }, () => `
            <div class="glass-panel rounded-2xl p-5 flex items-center gap-5">
                <div class="w-14 h-14 rounded-xl bg-white/5 skeleton-pulse flex-shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="h-4 w-48 rounded bg-white/5 skeleton-pulse"></div>
                    <div class="h-3 w-32 rounded bg-white/5 skeleton-pulse"></div>
                </div>
                <div class="flex gap-8">
                    <div class="h-8 w-16 rounded bg-white/5 skeleton-pulse hidden sm:block"></div>
                    <div class="h-8 w-12 rounded bg-white/5 skeleton-pulse"></div>
                </div>
            </div>
        `).join('');
        return;
    }

    if (state.matches.length === 0) {
        const filterName = GAMES.find(g => g.key === state.filter)?.label || 'selected games';
        list.innerHTML = `
            <div class="glass-panel rounded-2xl p-10 text-center">
                <div class="w-16 h-16 mx-auto mb-4 rounded-xl bg-white/5 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">No matches found</h3>
                <p class="text-sm text-gray-500">No recent ${esc(filterName)} matches for your linked Riot account.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = state.matches.map(renderMatchCard).join('');
    bindMatchClicks();
}

function renderLoadMore() {
    const container = document.getElementById('load-more-container');
    if (!container) return;

    if (!state.hasMore || state.matches.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <button id="btn-load-more" class="w-full py-3 glass-panel rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all">
            ${state.loading ? 'Loading...' : 'Load More Matches'}
        </button>
    `;

    const btn = document.getElementById('btn-load-more');
    if (btn && !state.loading) {
        btn.addEventListener('click', () => fetchMatches(false));
    }
}

// ── Match Detail Modal ──────────────────────────────────────────────────

const DDRAGON_ITEM = (id) => id && id > 0
    ? `https://ddragon.leagueoflegends.com/cdn/14.10.1/img/item/${id}.png`
    : null;

function formatGold(n) {
    if (!n) return '0';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function formatDmg(n) {
    if (!n) return '0';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function openMatchDetail(match) {
    if (match.gameType === 'lol') {
        openLolDetail(match);
    } else {
        openValDetail(match);
    }
}

async function openLolDetail(match) {
    const overlay = document.getElementById('match-detail-overlay');
    const content = document.getElementById('match-detail-content');
    if (!overlay || !content) return;

    content.innerHTML = `
        <div class="p-6 flex items-center justify-center">
            <div class="flex items-center gap-3 text-gray-400">
                <svg class="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span class="text-sm font-semibold">Loading match details...</span>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');

    try {
        const region = state.linkStatus?.riotRegion || 'euw1';
        const puuid = state.linkStatus?.riotPuuid || '';
        const detail = await apiRequest(
            `/riot-api/match/${encodeURIComponent(match.matchId)}?region=${region}&puuid=${puuid}`
        );
        renderLolDetail(detail, match);
    } catch (e) {
        console.error('[MatchDetail] Fetch failed:', e);
        content.innerHTML = `
            <div class="p-8 text-center">
                <p class="text-gray-400 text-sm mb-3">Failed to load match details.</p>
                <button onclick="document.getElementById('match-detail-overlay').classList.add('hidden')"
                    class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-all">Close</button>
            </div>
        `;
    }
}

function renderLolDetail(detail, match) {
    const content = document.getElementById('match-detail-content');
    if (!content) return;

    const ps = detail.playerStats;
    const gi = detail.gameInfo;
    const blue = detail.teamStats?.blue || {};
    const red = detail.teamStats?.red || {};

    const champIcon = ps.championName ? LOL_CHAMPION_ICON(ps.championName) : '';
    const durationStr = `${Math.floor((gi.duration || 0) / 60)}m ${(gi.duration || 0) % 60}s`;

    const itemsHtml = (ps.items || [])
        .filter(id => id && id > 0)
        .map(id => `<img src="${DDRAGON_ITEM(id)}" alt="Item" class="w-8 h-8 rounded-lg bg-[#0a0b0f]" onerror="this.style.display='none'">`)
        .join('');

    content.innerHTML = `
        <div class="p-6">
            <!-- Header -->
            <div class="flex items-start justify-between mb-6">
                <h2 class="text-xl font-black text-white uppercase tracking-wider">Match Details</h2>
                <button id="btn-close-detail"
                    class="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="flex flex-col lg:flex-row gap-6">
                <!-- Left: Player stats -->
                <div class="flex-1 min-w-0">
                    <!-- Champion + mode -->
                    <div class="flex items-center gap-4 mb-5">
                        <div class="w-16 h-16 rounded-xl overflow-hidden ring-2 ring-[#0bc6e3]/40 flex-shrink-0">
                            ${champIcon
                                ? `<img src="${champIcon}" alt="${esc(ps.championName)}" class="w-full h-full object-cover">`
                                : `<div class="w-full h-full bg-[#0bc6e3]/10 flex items-center justify-center"><span class="text-xl font-black text-[#0bc6e3]">LoL</span></div>`
                            }
                        </div>
                        <div>
                            <p class="text-lg font-black text-white">${esc(ps.championName)}</p>
                            <p class="text-xs text-gray-500">${esc(gi.queueType || gi.gameMode)} &bull; ${durationStr}</p>
                            <p class="text-[11px] text-gray-600">${timeAgo(gi.gameCreation)}</p>
                        </div>
                    </div>

                    <!-- Stat boxes -->
                    <div class="grid grid-cols-3 gap-2 mb-4">
                        <div class="glass-panel rounded-xl p-3 text-center">
                            <p class="text-lg font-black text-white">${ps.kills}/${ps.deaths}/${ps.assists}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">KDA</p>
                        </div>
                        <div class="glass-panel rounded-xl p-3 text-center">
                            <p class="text-lg font-black text-white">${ps.cs ?? 0}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">CS</p>
                        </div>
                        <div class="glass-panel rounded-xl p-3 text-center">
                            <p class="text-lg font-black text-white">${formatGold(ps.gold)}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Gold</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-2 mb-4">
                        <div class="glass-panel rounded-xl p-3 text-center">
                            <p class="text-lg font-black text-white">${formatDmg(ps.damageDealt)}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Damage</p>
                        </div>
                        <div class="glass-panel rounded-xl p-3 text-center">
                            <p class="text-lg font-black text-white">${ps.visionScore ?? 0}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Vision</p>
                        </div>
                        <div class="glass-panel rounded-xl p-3 text-center flex flex-col items-center justify-center">
                            <div class="flex items-center gap-1 flex-wrap justify-center">${itemsHtml || '<span class="text-gray-600 text-xs">—</span>'}</div>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Items</p>
                        </div>
                    </div>
                </div>

                <!-- Right: Team objectives -->
                <div class="lg:w-[280px] flex-shrink-0">
                    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Team Objectives</h3>

                    <div class="space-y-3">
                        <!-- Blue Team -->
                        <div class="glass-panel rounded-xl p-4 border-l-4 border-[#0bc6e3]">
                            <p class="text-xs font-bold text-[#0bc6e3] uppercase tracking-wider mb-2">Blue Team</p>
                            <div class="space-y-1.5 text-sm">
                                <div class="flex justify-between"><span class="text-gray-400">Kills</span><span class="font-bold text-white">${blue.totalKills ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Gold</span><span class="font-bold text-white">${formatGold(blue.totalGold)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Towers</span><span class="font-bold text-white">${blue.towers ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Barons</span><span class="font-bold text-white">${blue.barons ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Dragons</span><span class="font-bold text-white">${blue.dragons ?? 0}</span></div>
                            </div>
                        </div>

                        <!-- Red Team -->
                        <div class="glass-panel rounded-xl p-4 border-l-4 border-[#ff4654]">
                            <p class="text-xs font-bold text-[#ff4654] uppercase tracking-wider mb-2">Red Team</p>
                            <div class="space-y-1.5 text-sm">
                                <div class="flex justify-between"><span class="text-gray-400">Kills</span><span class="font-bold text-white">${red.totalKills ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Gold</span><span class="font-bold text-white">${formatGold(red.totalGold)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Towers</span><span class="font-bold text-white">${red.towers ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Barons</span><span class="font-bold text-white">${red.barons ?? 0}</span></div>
                                <div class="flex justify-between"><span class="text-gray-400">Dragons</span><span class="font-bold text-white">${red.dragons ?? 0}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-close-detail')?.addEventListener('click', closeMatchDetail);
}

function openValDetail(match) {
    const overlay = document.getElementById('match-detail-overlay');
    const content = document.getElementById('match-detail-content');
    if (!overlay || !content) return;

    const agentName = getAgentName(match.characterId);
    const isWin = match.win;
    const resultLabel = isWin ? 'VICTORY' : 'DEFEAT';
    const resultColor = isWin ? '#00ff87' : '#ff4654';
    const score = `${match.roundsWon} - ${match.roundsLost}`;
    const durationStr = match.gameLengthMs ? formatDurationMs(match.gameLengthMs) : '';

    content.innerHTML = `
        <div class="p-6">
            <div class="flex items-start justify-between mb-6">
                <h2 class="text-xl font-black text-white uppercase tracking-wider">Match Details</h2>
                <button id="btn-close-detail"
                    class="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="flex items-center gap-4 mb-6">
                <div class="w-16 h-16 rounded-xl bg-[#ff4654]/10 flex items-center justify-center ring-2 ring-[#ff4654]/40 flex-shrink-0">
                    <span class="text-2xl font-black text-[#ff4654]">V</span>
                </div>
                <div>
                    <p class="text-lg font-black text-white">${esc(agentName)}</p>
                    <p class="text-xs text-gray-500">${esc(match.map)} &bull; Valorant${durationStr ? ' &bull; ' + durationStr : ''}</p>
                    <p class="text-[11px] text-gray-600">${timeAgo(match.gameCreation)}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div class="glass-panel rounded-xl p-4 text-center">
                    <p class="text-2xl font-black" style="color: ${resultColor}">${resultLabel}</p>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Result</p>
                </div>
                <div class="glass-panel rounded-xl p-4 text-center">
                    <p class="text-2xl font-black text-white">${score}</p>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Rounds</p>
                </div>
                <div class="glass-panel rounded-xl p-4 text-center">
                    <p class="text-2xl font-black text-white">${match.kills}/${match.deaths}/${match.assists}</p>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">KDA</p>
                </div>
                <div class="glass-panel rounded-xl p-4 text-center">
                    <p class="text-2xl font-black text-white">${match.score}</p>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Combat Score</p>
                </div>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
    document.getElementById('btn-close-detail')?.addEventListener('click', closeMatchDetail);
}

function closeMatchDetail() {
    document.getElementById('match-detail-overlay')?.classList.add('hidden');
}

function bindMatchClicks() {
    const list = document.getElementById('match-list');
    if (!list) return;

    list.querySelectorAll('[data-match-id]').forEach(card => {
        card.addEventListener('click', () => {
            const matchId = card.dataset.matchId;
            const match = state.matches.find(m => m.matchId === matchId);
            if (match) openMatchDetail(match);
        });
    });
}

function showUnlinkedState() {
    const list = document.getElementById('match-list');
    const subtitle = document.getElementById('subtitle');
    if (subtitle) subtitle.textContent = 'Link your Riot account to see your match history.';

    if (list) {
        list.innerHTML = `
            <div class="glass-panel rounded-2xl p-10 text-center">
                <div class="w-20 h-20 mx-auto mb-5 rounded-2xl bg-[#ff4654]/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-[#ff4654]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3.877 2L1 6.838v14.29h5.663V24h3.186l3.174-2.872h4.857L24 15.293V2H3.877zm1.59 2.116h16.417v10.12l-3.77 3.77h-5.654L9.275 21.17v-3.166H5.467V4.116z"/>
                    </svg>
                </div>
                <h3 class="text-xl font-black text-white mb-2">Connect Your Riot Account</h3>
                <p class="text-sm text-gray-400 mb-6 max-w-md mx-auto">
                    Link your Riot Games account to see your League of Legends and Valorant match history, stats, and performance.
                </p>
                <button id="btn-link-account"
                    class="px-6 py-3 bg-[#ff4654] hover:bg-[#e03e4c] text-white font-bold rounded-xl transition-all text-sm">
                    Link Riot Account
                </button>
            </div>
        `;
        const btn = document.getElementById('btn-link-account');
        if (btn) {
            btn.addEventListener('click', () => {
                window.location.href = `../profile/profile.html?userId=${user?.id || user?._id}`;
            });
        }
    }
}

// ── Data Fetching ───────────────────────────────────────────────────────

async function checkRiotLink() {
    try {
        const link = await apiRequest('/riot-api/link-status');
        state.linkStatus = link;

        if (link.status !== 'verified') {
            showUnlinkedState();
            return false;
        }

        const badge = document.getElementById('riot-badge');
        const nameEl = document.getElementById('riot-name');
        const regionEl = document.getElementById('riot-region');

        if (badge) badge.classList.remove('hidden');
        if (nameEl) nameEl.textContent = `${link.riotGameName}#${link.riotTagLine}`;
        if (regionEl) regionEl.textContent = (link.riotRegion || '').toUpperCase();

        return true;
    } catch (e) {
        console.error('[RecentGames] Link status check failed:', e);
        showUnlinkedState();
        return false;
    }
}

async function fetchMatches(initial = false) {
    if (state.loading) return;
    state.loading = true;

    if (initial) {
        state.start = 0;
        state.matches = [];
    }

    renderMatches();
    renderLoadMore();

    try {
        const data = await apiRequest(
            `/riot-api/match-history?game=${state.filter}&start=${state.start}&count=${state.count}`
        );

        if (!data.linked) {
            showUnlinkedState();
            return;
        }

        if (initial) {
            state.matches = data.matches || [];
        } else {
            state.matches = [...state.matches, ...(data.matches || [])];
        }

        state.hasMore = (data.matches || []).length >= state.count;
        state.start += (data.matches || []).length;
    } catch (e) {
        console.error('[RecentGames] Fetch failed:', e);
        if (state.matches.length === 0) {
            const list = document.getElementById('match-list');
            if (list) {
                list.innerHTML = `
                    <div class="glass-panel rounded-2xl p-8 text-center">
                        <p class="text-gray-400 text-sm">Failed to load match history. Please try again.</p>
                        <button id="btn-retry" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-all">
                            Retry
                        </button>
                    </div>
                `;
                document.getElementById('btn-retry')?.addEventListener('click', () => fetchMatches(true));
            }
            return;
        }
    } finally {
        state.loading = false;
    }

    renderMatches();
    renderLoadMore();
}

// ── Navigation active state ─────────────────────────────────────────────

setTimeout(() => {
    const navPlay = document.getElementById('nav-play');
    const navRecentMatches = document.getElementById('nav-recent-matches');

    if (navPlay && navRecentMatches) {
        navPlay.classList.remove('active', 'text-white');
        navPlay.classList.add('text-gray-400');
        if (navPlay.querySelector('svg')) {
            navPlay.querySelector('svg').classList.remove('text-[#00ff87]');
        }
        navRecentMatches.classList.add('active');
        navRecentMatches.classList.remove('text-gray-400');
        navRecentMatches.classList.add('text-[#00ff87]');
    }
}, 100);

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { logout(); });

// ── Init ────────────────────────────────────────────────────────────────

// Close modal on overlay click or Escape
const detailOverlay = document.getElementById('match-detail-overlay');
if (detailOverlay) {
    detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) closeMatchDetail();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMatchDetail();
});

(async function init() {
    renderFilters();
    const linked = await checkRiotLink();
    if (linked) {
        await fetchMatches(true);
    }
})();
