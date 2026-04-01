const { ipcRenderer } = require('electron');
const { requireAuth, getUser, logout, apiRequest } = require('../../../shared/api');

// Auth gate: redirect to login if no token
if (!requireAuth()) {
    throw new Error('Not authenticated');
}

// Populate user info from stored profile
const user = getUser();
if (user) {
    const nickname = user.nickname || 'Player';
    const encodedName = encodeURIComponent(nickname);

    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarNickname = document.getElementById('sidebar-nickname');
    if (sidebarAvatar) sidebarAvatar.src = `https://ui-avatars.com/api/?name=${encodedName}&background=00ff87&color=0a0b0f&bold=true`;
    if (sidebarNickname) sidebarNickname.textContent = nickname;

    // Valorant leaderboard entry
    const lbAvatar = document.querySelector('.leaderboard-avatar');
    const lbNickname = document.querySelector('.leaderboard-nickname');
    if (lbAvatar) lbAvatar.src = `https://ui-avatars.com/api/?name=${encodedName}&background=00ff87&color=0a0b0f`;
    if (lbNickname) lbNickname.textContent = `${nickname} (You)`;

    // LoL leaderboard entry
    const lbAvatarLol = document.querySelector('.leaderboard-avatar-lol');
    const lbNicknameLol = document.querySelector('.leaderboard-nickname-lol');
    if (lbAvatarLol) lbAvatarLol.src = `https://ui-avatars.com/api/?name=${encodedName}&background=0bc6e3&color=0a0b0f`;
    if (lbNicknameLol) lbNicknameLol.textContent = `${nickname} (You)`;
}

// Parallax effect on hover cards
document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.glass-panel-hover');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 30;
        const rotateY = (centerX - x) / 30;

        if (x > 0 && x < rect.width && y > 0 && y < rect.height) {
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        } else {
            card.style.transform = '';
        }
    });
});

// Smooth number counting animation
function animateNumber(element, target, duration = 1000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Handle logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        logout();
    });
}

// Animate stats on page load
setTimeout(() => {
    const statNumbers = document.querySelectorAll('[data-stat-number]');
    statNumbers.forEach(el => {
        const target = parseInt(el.getAttribute('data-stat-number'));
        animateNumber(el, target, 1500);
    });
}, 300);

// Fetch live missions for dashboard cards
(async () => {
    try {
        const data = await apiRequest('/mission/active');
        const missions = data.missions || [];

        const REWARD_LABELS = { xp: 'XP', tokens: 'Tokens', nft: 'NFT' };
        const GAME_COLORS = { lol: '#0bc6e3', valorant: '#ff4654', all: '#00ff87' };
        function escH(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

        const soloMissions = missions.filter(m => m.scope === 'individual');
        const friendMissions = missions.filter(m => m.scope === 'friends');

        // Missions ticket badge (solo unclaimed count)
        const missionsBadge = document.getElementById('dashboard-missions-count');
        if (missionsBadge) {
            const unclaimed = soloMissions.filter(m => !m.userProgress?.claimed).length;
            missionsBadge.textContent = `${unclaimed} Active`;
        }

        // Friends Activities ticket — avatars row + count (old UI style)
        const friendsAvatars = document.getElementById('dashboard-friends-avatars');
        const friendsLabel = document.getElementById('dashboard-friends-mission-count');
        const activeFriend = friendMissions.filter(m => !m.userProgress?.claimed);
        if (friendsAvatars) {
            const colors = ['#00ff87', '#22d3ee', '#a855f7', '#f59e0b'];
            friendsAvatars.innerHTML = activeFriend.slice(0, 3).map((m, i) => {
                const bg = m.iconColor || colors[i % colors.length];
                const initials = (m.title || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return `<div class="w-7 h-7 rounded-full ring-2 ring-[#12141c] flex items-center justify-center text-[9px] font-black text-[#0a0b0f]" style="background:${bg}">${initials}</div>`;
            }).join('');
        }
        if (friendsLabel) {
            friendsLabel.textContent = `${activeFriend.length} active co-op missions`;
        }

        // Competitive Missions section (solo daily, top 3)
        const soloList = document.getElementById('dashboard-solo-missions-list');
        const solo = soloMissions.filter(m => m.type === 'daily').slice(0, 3);
        if (soloList) {
            if (!solo.length) {
                document.getElementById('dashboard-solo-missions').style.display = 'none';
            } else {
                soloList.innerHTML = solo.map(m => {
                    const cur = m.userProgress?.current || 0;
                    const target = m.criteria?.target || 1;
                    const pct = Math.min(100, Math.round((cur / target) * 100));
                    const color = m.iconColor || GAME_COLORS[m.game] || '#00ff87';
                    const reward = `+${m.rewardAmount} ${REWARD_LABELS[m.rewardType] || m.rewardType}`;
                    return `<div class="glass-panel rounded-2xl p-5 flex items-center gap-5">
                        <div class="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${color}15;border:1px solid ${color}30">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" style="color:${color}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <p class="text-base font-bold text-white">${escH(m.title)}</p>
                                <span class="px-2 py-0.5 text-xs font-bold rounded" style="background:${color}33;color:${color}">${reward}</span>
                            </div>
                            <p class="text-xs text-gray-500">${escH(m.description)}</p>
                            <div class="flex items-center gap-2 mt-2">
                                <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                                </div>
                                <span class="text-xs font-bold text-gray-400">${cur}/${target}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            }
        }

        // Friends Missions section (all friend-scope missions)
        const friendList = document.getElementById('dashboard-friend-missions-list');
        const friends = friendMissions.slice(0, 4);
        if (friendList) {
            if (!friends.length) {
                document.getElementById('dashboard-friend-missions').style.display = 'none';
            } else {
                friendList.innerHTML = friends.map(m => {
                    const color = m.iconColor || '#a855f7';
                    const cur = m.userProgress?.current || 0;
                    const target = m.criteria?.target || 1;
                    const pct = Math.min(100, Math.round((cur / target) * 100));
                    const reward = `+${m.rewardAmount} ${REWARD_LABELS[m.rewardType] || m.rewardType}`;
                    const typeBadge = m.type === 'weekly'
                        ? '<span class="px-1.5 py-0.5 bg-[#a855f7]/20 text-[#a855f7] text-[9px] font-bold rounded uppercase">Weekly</span>'
                        : '<span class="px-1.5 py-0.5 bg-[#22d3ee]/20 text-[#22d3ee] text-[9px] font-bold rounded uppercase">Daily</span>';
                    return `<a href="../missions/missions.html" class="glass-panel rounded-2xl p-6 hover:border-[#a855f7]/30 transition-all block no-underline">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background:${color}20;border:1px solid ${color}40">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" style="color:${color}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h4 class="text-base font-bold text-white">${escH(m.title)}</h4>
                                    ${typeBadge}
                                </div>
                                <p class="text-xs font-semibold" style="color:${color}">${reward}</p>
                            </div>
                        </div>
                        <p class="text-sm text-gray-400 mb-4">${escH(m.description)}</p>
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                            </div>
                            <span class="text-xs font-bold text-gray-400">${cur}/${target}</span>
                        </div>
                    </a>`;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Failed to load dashboard missions:', err);
    }
})();

