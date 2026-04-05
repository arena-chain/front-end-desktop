const { ipcRenderer } = require('electron');
const { requireAuth, apiRequest, logout, getUser } = require('../../../shared/api');
const { connectPresence, getFriends, onPresence } = require('../../../shared/presence');

if (!requireAuth()) throw new Error('Not authenticated');

const currentUser = getUser();
const params = new URLSearchParams(window.location.search);
const targetUserId = params.get('userId') || currentUser?.id;
const isOwnProfile = targetUserId === currentUser?.id;

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TIER_COLORS = {
    IRON: { bg: '#5c5c5c', text: '#a0a0a0' },
    BRONZE: { bg: '#8b4513', text: '#cd853f' },
    SILVER: { bg: '#6b7280', text: '#c0c0c0' },
    GOLD: { bg: '#b8860b', text: '#ffd700' },
    PLATINUM: { bg: '#1e8a7e', text: '#40e0d0' },
    EMERALD: { bg: '#1a6b3c', text: '#50c878' },
    DIAMOND: { bg: '#4169e1', text: '#b9f2ff' },
    MASTER: { bg: '#7b2d8b', text: '#da70d6' },
    GRANDMASTER: { bg: '#8b0000', text: '#ff4654' },
    CHALLENGER: { bg: '#d4af37', text: '#fffacd' },
};

const GAME_ICONS = {
    valorant: { letter: 'V', color: '#ff4654' },
    lol: { letter: 'LoL', color: '#0bc6e3' },
    leagueoflegends: { letter: 'LoL', color: '#0bc6e3' },
    cs2: { letter: 'CS', color: '#f59e0b' },
    fortnite: { letter: 'FN', color: '#a855f7' },
};

function avatarUrl(name, bg) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=${bg || '00ff87'}&color=0a0b0f&bold=true&size=128`;
}

function tierGradient(tier) {
    const t = TIER_COLORS[(tier || '').toUpperCase()] || TIER_COLORS.IRON;
    return t;
}

function pickPrimaryArenaRank(ranks) {
    if (!Array.isArray(ranks) || ranks.length === 0) return null;
    const lol = ranks.find((r) => {
        const t = (r.game && (r.game.title || r.game.name) || '').toLowerCase();
        return t.includes('league') || /\blol\b/.test(t);
    });
    return lol || ranks[0];
}

async function loadProfile() {
    showLoading();

    try {
        const [playerProfile, ranks, friendshipStatus] = await Promise.all([
            apiRequest(`/player/${targetUserId}`).catch(() => null),
            apiRequest(`/rank/user/${targetUserId}/all`).catch(() => []),
            isOwnProfile ? Promise.resolve(null) : apiRequest(`/friendship/status/${currentUser.id}/${targetUserId}`).catch(() => null),
        ]);

        let userInfo = playerProfile?.userId;
        if (!userInfo || typeof userInfo === 'string') {
            userInfo = { nickname: 'Unknown Player', email: '', region: 'EUROPE', country: '' };
        }

        renderProfile(userInfo, playerProfile, ranks || [], friendshipStatus);
    } catch (err) {
        console.error('Profile load error:', err);
        document.getElementById('profile-content').innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-gray-500">
                <p class="text-lg font-semibold">Failed to load profile</p>
                <p class="text-sm mt-1">${esc(err.message)}</p>
            </div>
        `;
    }
}

function showLoading() {
    document.getElementById('profile-content').innerHTML = `
        <div class="animate-pulse space-y-6">
            <div class="flex items-center gap-6">
                <div class="w-24 h-24 rounded-2xl bg-white/5"></div>
                <div class="space-y-3 flex-1">
                    <div class="h-7 bg-white/5 rounded w-48"></div>
                    <div class="h-4 bg-white/5 rounded w-32"></div>
                </div>
            </div>
            <div class="grid grid-cols-4 gap-4">
                <div class="h-24 bg-white/5 rounded-2xl"></div>
                <div class="h-24 bg-white/5 rounded-2xl"></div>
                <div class="h-24 bg-white/5 rounded-2xl"></div>
                <div class="h-24 bg-white/5 rounded-2xl"></div>
            </div>
        </div>
    `;
}

function renderProfile(user, profile, ranks, friendshipStatus) {
    const container = document.getElementById('profile-content');
    const nickname = user.nickname || 'Unknown';
    const primaryRank = pickPrimaryArenaRank(ranks);
    const tier = primaryRank?.tier || 'Unranked';
    const elo = primaryRank?.elo ?? 1000;
    const tc = tierGradient(tier);
    const riotLinked = profile?.riotLinkStatus === 'verified';

    const friendStatus = friendshipStatus?.status || 'NONE';
    let friendActionHtml = '';
    if (!isOwnProfile) {
        if (friendStatus === 'ACCEPTED') {
            friendActionHtml = `<span class="px-4 py-2 text-xs font-bold text-[#00ff87] bg-[#00ff87]/10 rounded-xl border border-[#00ff87]/20">FRIENDS</span>`;
        } else if (friendStatus === 'PENDING') {
            friendActionHtml = `<span class="px-4 py-2 text-xs font-bold text-yellow-400 bg-yellow-400/10 rounded-xl border border-yellow-400/20">REQUEST PENDING</span>`;
        } else {
            friendActionHtml = `<button id="add-friend-btn" class="px-5 py-2 text-xs font-bold bg-[#00ff87]/20 text-[#00ff87] rounded-xl border border-[#00ff87]/30 hover:bg-[#00ff87]/30 transition-all">ADD FRIEND</button>`;
        }
    }

    const riotHtml = riotLinked ? `
        <div class="flex items-center gap-2 mt-2">
            <span class="px-2 py-0.5 bg-[#ff4654]/20 text-[#ff4654] text-[10px] font-bold rounded border border-[#ff4654]/30">RIOT LINKED</span>
            <span class="text-xs text-gray-400">${esc(profile.riotGameName)}#${esc(profile.riotTagLine)}</span>
        </div>
    ` : '';

    const statsHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <div class="glass-panel rounded-2xl p-4 text-center">
                <p class="text-2xl font-black text-white">${esc(String(elo))}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Arena ELO</p>
            </div>
            <div class="glass-panel rounded-2xl p-4 text-center">
                <p class="text-2xl font-black" style="color: ${tc.text}">${esc(String(tier).toUpperCase())}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Tier</p>
            </div>
            <div class="glass-panel rounded-2xl p-4 text-center">
                <p class="text-2xl font-black text-white">${ranks.length}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Games Ranked</p>
            </div>
            <div class="glass-panel rounded-2xl p-4 text-center">
                <p class="text-2xl font-black text-[#00ff87]">${profile?.isPro ? 'PRO' : profile?.isVerified ? 'VERIFIED' : 'STANDARD'}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Account</p>
            </div>
        </div>
    `;

    const ranksHtml = ranks.length > 0 ? `
        <div class="mt-8">
            <h2 class="text-lg font-black text-white uppercase tracking-wider mb-4">Game Rankings</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${ranks.map(r => {
                    const gameName = r.game?.title || r.game?.name || 'Unknown';
                    const gameKey = (gameName || '').toLowerCase().replace(/\s+/g, '');
                    const gi = GAME_ICONS[gameKey] || { letter: gameName.charAt(0).toUpperCase(), color: '#6b7280' };
                    const rtc = tierGradient(r.tier);
                    const winRate = r.totalMatches > 0 ? Math.round((r.wins / r.totalMatches) * 100) : 0;

                    return `
                        <div class="glass-panel rounded-2xl p-5 hover:border-[#00ff87]/20 transition-all">
                            <div class="flex items-center gap-4 mb-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: ${gi.color}">
                                    <span class="text-sm font-black text-white">${gi.letter}</span>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-white">${esc(gameName)}</p>
                                    <p class="text-xs font-bold" style="color: ${rtc.text}">${esc(r.tier)} ${r.division ? 'DIV ' + r.division : ''}</p>
                                </div>
                                <div class="ml-auto text-right">
                                    <p class="text-lg font-black text-white">${r.elo}</p>
                                    <p class="text-[10px] text-gray-500 uppercase">ELO</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-4 gap-3 text-center">
                                <div>
                                    <p class="text-sm font-bold text-[#00ff87]">${r.wins || 0}</p>
                                    <p class="text-[9px] text-gray-500 uppercase">WINS</p>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-[#ff4654]">${r.losses || 0}</p>
                                    <p class="text-[9px] text-gray-500 uppercase">LOSSES</p>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-white">${winRate}%</p>
                                    <p class="text-[9px] text-gray-500 uppercase">WIN RATE</p>
                                </div>
                                <div>
                                    <p class="text-sm font-bold ${r.currentStreak >= 0 ? 'text-[#00ff87]' : 'text-[#ff4654]'}">${r.currentStreak > 0 ? '+' : ''}${r.currentStreak || 0}</p>
                                    <p class="text-[9px] text-gray-500 uppercase">STREAK</p>
                                </div>
                            </div>
                            ${r.totalMatches > 0 ? `
                                <div class="mt-3 h-1.5 rounded-full overflow-hidden bg-white/5">
                                    <div class="h-full rounded-full" style="width: ${winRate}%; background: linear-gradient(90deg, #00ff87, #22d3ee)"></div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    ` : `
        <div class="mt-8 glass-panel rounded-2xl p-8 text-center text-gray-500">
            <p class="text-sm">No game rankings yet</p>
        </div>
    `;

    const regionFlag = (user.country || '').toLowerCase() === 'tunisia' ? 'TN' : (user.region || 'EU');

    const friendsBtnHtml = isOwnProfile ? `
        <a href="../freinds/freinds.html"
           class="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold bg-[#22d3ee]/20 text-[#22d3ee] rounded-xl border border-[#22d3ee]/30 hover:bg-[#22d3ee]/30 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            FRIENDS
        </a>
    ` : '';

    const recentMatchesBtnHtml = isOwnProfile ? `
        <a href="../recent_games/recent_games.html"
           class="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold bg-[#ff7800]/20 text-[#ff7800] rounded-xl border border-[#ff7800]/30 hover:bg-[#ff7800]/30 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h8m-8 5h8m-8 5h5M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/>
            </svg>
            RECENT MATCHES
        </a>
    ` : '';

    container.innerHTML = `
        <!-- Header -->
        <div class="flex items-start gap-6">
            <div class="relative">
                <div class="w-24 h-24 rounded-2xl overflow-hidden" style="box-shadow: 0 0 0 3px ${tc.text}, 0 0 20px ${tc.text}40">
                    <img src="${user.avatar || avatarUrl(nickname)}" alt="" class="w-full h-full object-cover"
                         onerror="this.src='${avatarUrl(nickname)}'">
                </div>
                ${profile?.isPro ? '<span class="absolute -top-2 -right-2 px-2 py-0.5 bg-[#ffd700] text-[#1a0a00] text-[9px] font-black rounded">PRO</span>' : ''}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 flex-wrap">
                    <h1 class="text-3xl font-black text-white">${esc(nickname)}</h1>
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded border" style="color: ${tc.text}; border-color: ${tc.text}40; background: ${tc.bg}20">${esc(tier.toUpperCase())}</span>
                    <span class="px-2 py-0.5 text-[10px] font-bold text-gray-400 bg-white/5 rounded">${regionFlag}</span>
                </div>
                <p class="text-sm text-gray-500 mt-1">${esc(user.email || '')}</p>
                ${riotHtml}
                <div class="mt-3 flex items-center gap-3 flex-wrap">${friendActionHtml}${friendsBtnHtml}${recentMatchesBtnHtml}</div>
            </div>
        </div>

        ${statsHtml}
        ${ranksHtml}
    `;

    const addBtn = document.getElementById('add-friend-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            try {
                await apiRequest('/friendship/send-request', {
                    method: 'POST',
                    body: JSON.stringify({ requesterId: currentUser.id, recipientId: targetUserId }),
                });
                addBtn.outerHTML = '<span class="px-4 py-2 text-xs font-bold text-yellow-400 bg-yellow-400/10 rounded-xl border border-yellow-400/20">REQUEST SENT</span>';
            } catch (err) {
                alert(err.message || 'Failed to send request');
            }
        });
    }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => { if (logout) logout(); });
}

loadProfile();
