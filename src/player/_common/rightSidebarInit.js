const { getAccessToken, apiRequest, getUser } = require('../../../shared/api');

let presenceModule = null;
try { presenceModule = require('../../../shared/presence'); } catch (e) { console.warn('[RightSidebar] Could not load presence module:', e.message); }

const STATUS_CONFIG = {
    in_game: { color: '#ff4654', dot: '#ff4654', ring: 'ring-[#ff4654]/60', label: (g, d) => `In game${g ? ' \u00b7 ' + g : ''}${d ? ' \u00b7 ' + d : ''}` },
    in_queue: { color: '#0bc6e3', dot: '#00ff87', ring: 'ring-[#0bc6e3]/60', label: (g) => `In queue${g ? ' \u00b7 ' + g : ''}` },
    online: { color: '#00ff87', dot: '#00ff87', ring: 'ring-[#00ff87]/40', label: () => 'Online' },
    away: { color: '#f59e0b', dot: '#f59e0b', ring: 'ring-amber-400/50', label: () => 'Away' },
    offline: { color: '#4b5563', dot: '#4b5563', ring: 'ring-gray-600/30', label: () => 'Offline' },
};

const GAME_COLORS = { valorant: '#ff4654', lol: '#0bc6e3', cs2: '#f59e0b', fortnite: '#a855f7' };

let friends = [];
let presenceReady = false;

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function avatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=00ff87&color=0a0b0f&bold=true`;
}

function renderFriends() {
    const list = document.getElementById('friends-connected-list');
    if (!list) return;

    const online = friends.filter(f => f.status !== 'offline');
    const offline = friends.filter(f => f.status === 'offline');

    if (friends.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-600 text-xs py-6">No friends yet</p>';
        return;
    }

    const sorted = [...online, ...offline];
    list.innerHTML = sorted.map(f => {
        const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.offline;
        const gameColor = f.game ? (GAME_COLORS[f.game.toLowerCase()] || '#6b7280') : cfg.color;
        const dotColor = cfg.dot;
        const ringCls = cfg.ring;
        const statusText = cfg.label(f.game, f.details);
        const statusColor = f.status === 'in_game' ? gameColor : cfg.color;
        const opacity = f.status === 'offline' ? 'opacity-40' : '';

        return `
            <button type="button" data-user-id="${f.userId}"
                class="friend-row w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/5 border border-transparent hover:border-white/10 ${opacity}">
                <div class="relative flex-shrink-0">
                    <div class="w-10 h-10 rounded-lg overflow-hidden ring-2 ${ringCls}">
                        <img src="${f.avatar || avatarUrl(f.nickname)}" alt="" class="h-full w-full shrink-0 object-cover"
                             onerror="this.src='${avatarUrl(f.nickname)}'">
                    </div>
                    <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#12141c] rounded-full ${f.status === 'in_queue' ? 'animate-pulse-dot' : ''}"
                          style="background: ${dotColor}"></span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">${esc(f.nickname)}</p>
                    <p class="text-[11px] truncate" style="color: ${statusColor}">${esc(statusText)}</p>
                </div>
            </button>
        `;
    }).join('');

    list.querySelectorAll('.friend-row').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.userId;
            if (uid) window.location.href = `../profile/profile.html?userId=${uid}`;
        });
    });
}

function friendFromDoc(doc) {
    const user = getUser();
    const myId = user?.id || user?._id;
    const reqId = doc.requesterId?._id || doc.requesterId;
    const isRequester = String(reqId) === String(myId);
    const other = isRequester ? doc.recipientId : doc.requesterId;
    return {
        userId: other?._id || other,
        nickname: other?.nickname || 'Unknown',
        email: other?.email || '',
        avatar: other?.avatar || null,
        status: 'offline',
    };
}

function mergePresenceIntoFriends(presenceFriends) {
    if (!presenceFriends || presenceFriends.length === 0) return;

    const presenceMap = new Map();
    for (const pf of presenceFriends) {
        presenceMap.set(String(pf.userId), pf);
    }

    for (const f of friends) {
        const pf = presenceMap.get(String(f.userId));
        if (pf) {
            f.status = pf.status || 'offline';
            f.game = pf.game;
            f.details = pf.details;
            if (pf.nickname && pf.nickname !== 'Unknown') f.nickname = pf.nickname;
            if (pf.avatar) f.avatar = pf.avatar;
        }
    }

    for (const pf of presenceFriends) {
        const exists = friends.some(f => String(f.userId) === String(pf.userId));
        if (!exists) {
            friends.push({
                userId: pf.userId,
                nickname: pf.nickname || 'Unknown',
                email: pf.email || '',
                avatar: pf.avatar || null,
                status: pf.status || 'offline',
                game: pf.game,
                details: pf.details,
            });
        }
    }
}

async function loadFriendsViaRest() {
    const user = getUser();
    const myId = user?.id || user?._id;
    if (!myId) {
        console.warn('[RightSidebar] No user ID found');
        return;
    }

    try {
        const docs = await apiRequest(`/friendship/friends/${myId}`);
        const arr = Array.isArray(docs) ? docs : [];

        if (presenceReady) {
            const restFriends = arr.map(friendFromDoc);
            const existingIds = new Set(friends.map(f => String(f.userId)));
            for (const rf of restFriends) {
                if (!existingIds.has(String(rf.userId))) {
                    friends.push(rf);
                }
            }
        } else {
            friends = arr.map(friendFromDoc);
        }

        console.log(`[RightSidebar] Loaded ${friends.length} friends via REST`);
        renderFriends();
    } catch (e) {
        console.error('[RightSidebar] REST friends load failed:', e.message || e);
        const list = document.getElementById('friends-connected-list');
        if (list && friends.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-600 text-xs py-6">Could not load friends</p>';
        }
    }
}

function updateFriend(userId, changes) {
    const idx = friends.findIndex(f => String(f.userId) === String(userId));
    if (idx >= 0) {
        Object.assign(friends[idx], changes);
        renderFriends();
        return true;
    }
    return false;
}

async function fetchAndApplyPresence(getFriends) {
    try {
        const presenceFriends = await getFriends();
        if (presenceFriends && presenceFriends.length > 0) {
            presenceReady = true;
            mergePresenceIntoFriends(presenceFriends);
            renderFriends();
        }
    } catch (e) {
        console.warn('[RightSidebar] Failed to fetch presence friends:', e.message || e);
    }
}

async function initPresence() {
    if (!presenceModule) return;

    const { connectPresence, clearListeners, getFriends, onPresence } = presenceModule;

    clearListeners();

    onPresence('connected', () => {
        console.log('[RightSidebar] Presence connected');
    });

    onPresence('presence-ready', (data) => {
        console.log('[RightSidebar] Received presence-ready with', data?.friends?.length, 'friends');
        if (data?.friends) {
            presenceReady = true;
            mergePresenceIntoFriends(data.friends);
            renderFriends();
        }
    });

    onPresence('friend-online', (data) => {
        const found = updateFriend(data.userId, { status: data.status || 'online' });
        if (!found) loadFriendsViaRest();
    });
    onPresence('friend-offline', (data) => updateFriend(data.userId, { status: 'offline', game: undefined, details: undefined }));
    onPresence('friend-status', (data) => updateFriend(data.userId, { status: data.status, game: data.game, details: data.details }));

    try {
        await connectPresence();
    } catch (e) {
        console.warn('[RightSidebar] Presence socket failed:', e.message || e);
    }
}

if (getAccessToken()) {
    const list = document.getElementById('friends-connected-list');
    if (list) list.innerHTML = '<p class="text-center text-gray-600 text-xs py-6 animate-pulse">Loading friends...</p>';

    loadFriendsViaRest();
    initPresence();
}
