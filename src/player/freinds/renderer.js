const { ipcRenderer, shell } = require('electron');
const { requireAuth, apiRequest, logout, getUser } = require('../../../shared/api');

if (!requireAuth()) {
    throw new Error('Not authenticated');
}

const user = getUser();
const userId = user?.id;

const TABS = [
    { key: 'friends',  label: 'Friends' },
    { key: 'pending',  label: 'Pending' },
    { key: 'sent',     label: 'Sent' },
    { key: 'blocked',  label: 'Blocked' },
];

let state = {
    tab: 'friends',
    friends: [],
    pending: [],
    sent: [],
    blocked: [],
    loading: false,
    searchQuery: '',
    searchResults: [],
    searchLoading: false,
    counts: { pending: 0 },
};

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function avatar(name) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'user')}`;
}

function friendFromDoc(doc) {
    const isRequester = doc.requesterId?._id === userId || doc.requesterId === userId;
    const other = isRequester ? doc.recipientId : doc.requesterId;
    return {
        friendshipId: doc._id,
        userId: other?._id || other,
        nickname: other?.nickname || 'Unknown',
        email: other?.email || '',
        status: doc.status,
        createdAt: doc.createdAt,
    };
}

function pendingFromDoc(doc) {
    const sender = doc.requesterId;
    return {
        friendshipId: doc._id,
        userId: sender?._id || sender,
        nickname: sender?.nickname || 'Unknown',
        email: sender?.email || '',
        createdAt: doc.createdAt,
    };
}

function sentFromDoc(doc) {
    const recipient = doc.recipientId;
    return {
        friendshipId: doc._id,
        userId: recipient?._id || recipient,
        nickname: recipient?.nickname || 'Unknown',
        email: recipient?.email || '',
        createdAt: doc.createdAt,
    };
}

function blockedFromDoc(doc) {
    const blocked = doc.recipientId;
    return {
        friendshipId: doc._id,
        userId: blocked?._id || blocked,
        nickname: blocked?.nickname || 'Unknown',
        email: blocked?.email || '',
    };
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
}

// ─── Data fetching ───

async function fetchAll() {
    if (!userId) return;
    state.loading = true;
    renderContent();

    try {
        const [friends, pending, sent, blocked] = await Promise.all([
            apiRequest(`/friendship/friends/${userId}`),
            apiRequest(`/friendship/pending-requests/${userId}`),
            apiRequest(`/friendship/sent-requests/${userId}`),
            apiRequest(`/friendship/blocked/${userId}`),
        ]);

        state.friends = (friends || []).map(friendFromDoc);
        state.pending = (pending || []).map(pendingFromDoc);
        state.sent = (sent || []).map(sentFromDoc);
        state.blocked = (blocked || []).map(blockedFromDoc);
        state.counts.pending = state.pending.length;
    } catch (err) {
        console.error('Failed to load friends:', err);
    } finally {
        state.loading = false;
        renderTabs();
        renderContent();
    }
}

// ─── Actions ───

async function acceptRequest(friendshipId) {
    try {
        await apiRequest(`/friendship/accept/${friendshipId}`, {
            method: 'POST',
            body: JSON.stringify({ userId }),
        });
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to accept request');
    }
}

async function rejectRequest(friendshipId) {
    try {
        await apiRequest(`/friendship/reject/${friendshipId}`, {
            method: 'POST',
            body: JSON.stringify({ userId }),
        });
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to reject request');
    }
}

async function removeFriend(friendId) {
    try {
        await apiRequest('/friendship/remove', {
            method: 'DELETE',
            body: JSON.stringify({ userId, friendId }),
        });
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to remove friend');
    }
}

async function blockUser(blockedUserId) {
    try {
        await apiRequest('/friendship/block', {
            method: 'POST',
            body: JSON.stringify({ userId, blockedUserId }),
        });
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to block user');
    }
}

async function unblockUser(blockedUserId) {
    try {
        await apiRequest('/friendship/unblock', {
            method: 'DELETE',
            body: JSON.stringify({ userId, blockedUserId }),
        });
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to unblock user');
    }
}

async function sendRequest(recipientId) {
    try {
        await apiRequest('/friendship/send-request', {
            method: 'POST',
            body: JSON.stringify({ requesterId: userId, recipientId }),
        });
        state.searchResults = state.searchResults.filter(u => u._id !== recipientId);
        renderSearchResults();
        await fetchAll();
    } catch (err) {
        alert(err.message || 'Failed to send friend request');
    }
}

async function searchUsers(query) {
    if (!query || query.length < 2) {
        state.searchResults = [];
        renderSearchResults();
        return;
    }
    state.searchLoading = true;
    renderSearchResults();
    try {
        const results = await apiRequest(`/users/search?q=${encodeURIComponent(query)}&excludeUserId=${userId}`);
        state.searchResults = results || [];
    } catch {
        state.searchResults = [];
    } finally {
        state.searchLoading = false;
        renderSearchResults();
    }
}

// ─── Rendering ───

function renderTabs() {
    const container = document.getElementById('friend-tabs');
    container.innerHTML = TABS.map(tab => {
        const active = state.tab === tab.key;
        const cls = active
            ? 'bg-[#00ff87]/20 text-[#00ff87] border-[#00ff87]/30'
            : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white';
        const badge = tab.key === 'pending' && state.counts.pending > 0
            ? `<span class="ml-2 px-2 py-0.5 bg-[#ff4654] text-white text-[10px] font-bold rounded-full">${state.counts.pending}</span>`
            : '';
        return `<button data-tab="${tab.key}" class="tab-btn px-5 py-2.5 text-xs font-bold rounded-xl border transition-all ${cls}">${tab.label}${badge}</button>`;
    }).join('');

    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.tab = btn.dataset.tab;
            renderTabs();
            renderContent();
        });
    });
}

function renderContent() {
    const container = document.getElementById('friend-content');

    if (state.loading) {
        container.innerHTML = Array.from({ length: 4 }, () => `
            <div class="glass-panel rounded-2xl p-5 flex items-center gap-4 animate-pulse">
                <div class="w-12 h-12 rounded-full bg-white/5"></div>
                <div class="flex-1 space-y-2">
                    <div class="h-4 bg-white/5 rounded w-1/3"></div>
                    <div class="h-3 bg-white/5 rounded w-1/4"></div>
                </div>
            </div>
        `).join('');
        return;
    }

    const renderers = {
        friends: renderFriendsList,
        pending: renderPendingList,
        sent: renderSentList,
        blocked: renderBlockedList,
    };

    (renderers[state.tab] || renderers.friends)(container);
}

function emptyState(icon, title, subtitle) {
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
            ${icon}
            <p class="text-lg font-semibold mt-4">${title}</p>
            <p class="text-sm mt-1">${subtitle}</p>
        </div>
    `;
}

const ICONS = {
    friends: '<svg class="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    pending: '<svg class="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    sent: '<svg class="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>',
    blocked: '<svg class="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>',
};

function renderFriendsList(container) {
    if (state.friends.length === 0) {
        container.innerHTML = emptyState(ICONS.friends, 'No friends yet', 'Use the search above to find and add friends');
        return;
    }
    container.innerHTML = state.friends.map(f => `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-4 hover:border-[#00ff87]/20 transition-all">
            <img src="${avatar(f.nickname)}" class="w-12 h-12 rounded-full bg-white/5" alt="">
            <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm truncate">${esc(f.nickname)}</p>
                <p class="text-gray-500 text-xs truncate">${esc(f.email)}</p>
            </div>
            <div class="flex gap-2">
                <button data-action="remove" data-id="${f.userId}" class="action-btn px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 border border-white/5 hover:bg-[#ff4654]/20 hover:text-[#ff4654] hover:border-[#ff4654]/30 transition-all">REMOVE</button>
                <button data-action="block" data-id="${f.userId}" class="action-btn px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 border border-white/5 hover:bg-[#ff4654]/20 hover:text-[#ff4654] hover:border-[#ff4654]/30 transition-all">BLOCK</button>
            </div>
        </div>
    `).join('');
    bindActions(container);
}

function renderPendingList(container) {
    if (state.pending.length === 0) {
        container.innerHTML = emptyState(ICONS.pending, 'No pending requests', 'Friend requests you receive will appear here');
        return;
    }
    container.innerHTML = state.pending.map(f => `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-4 hover:border-[#00ff87]/20 transition-all">
            <img src="${avatar(f.nickname)}" class="w-12 h-12 rounded-full bg-white/5" alt="">
            <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm truncate">${esc(f.nickname)}</p>
                <p class="text-gray-500 text-xs">${timeAgo(f.createdAt)}</p>
            </div>
            <div class="flex gap-2">
                <button data-action="accept" data-id="${f.friendshipId}" class="action-btn px-4 py-1.5 text-[10px] font-bold rounded-lg bg-[#00ff87]/20 text-[#00ff87] border border-[#00ff87]/30 hover:bg-[#00ff87]/30 transition-all">ACCEPT</button>
                <button data-action="reject" data-id="${f.friendshipId}" class="action-btn px-4 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 border border-white/5 hover:bg-[#ff4654]/20 hover:text-[#ff4654] hover:border-[#ff4654]/30 transition-all">REJECT</button>
            </div>
        </div>
    `).join('');
    bindActions(container);
}

function renderSentList(container) {
    if (state.sent.length === 0) {
        container.innerHTML = emptyState(ICONS.sent, 'No sent requests', 'Requests you send will appear here');
        return;
    }
    container.innerHTML = state.sent.map(f => `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-4 hover:border-[#00ff87]/20 transition-all">
            <img src="${avatar(f.nickname)}" class="w-12 h-12 rounded-full bg-white/5" alt="">
            <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm truncate">${esc(f.nickname)}</p>
                <p class="text-gray-500 text-xs">Sent ${timeAgo(f.createdAt)}</p>
            </div>
            <span class="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">PENDING</span>
        </div>
    `).join('');
}

function renderBlockedList(container) {
    if (state.blocked.length === 0) {
        container.innerHTML = emptyState(ICONS.blocked, 'No blocked users', 'Users you block will appear here');
        return;
    }
    container.innerHTML = state.blocked.map(f => `
        <div class="glass-panel rounded-2xl p-5 flex items-center gap-4 hover:border-white/10 transition-all">
            <img src="${avatar(f.nickname)}" class="w-12 h-12 rounded-full bg-white/5 opacity-50" alt="">
            <div class="flex-1 min-w-0">
                <p class="text-gray-400 font-bold text-sm truncate">${esc(f.nickname)}</p>
                <p class="text-gray-600 text-xs truncate">${esc(f.email)}</p>
            </div>
            <button data-action="unblock" data-id="${f.userId}" class="action-btn px-4 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white transition-all">UNBLOCK</button>
        </div>
    `).join('');
    bindActions(container);
}

function bindActions(container) {
    container.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'accept')  acceptRequest(id);
            if (action === 'reject')  rejectRequest(id);
            if (action === 'remove')  removeFriend(id);
            if (action === 'block')   blockUser(id);
            if (action === 'unblock') unblockUser(id);
        });
    });
}

function renderSearchResults() {
    const container = document.getElementById('search-results');
    if (!state.searchQuery || state.searchQuery.length < 2) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    if (state.searchLoading) {
        container.innerHTML = `<div class="p-4 text-center text-gray-500 text-sm">Searching...</div>`;
        return;
    }

    if (state.searchResults.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-gray-500 text-sm">No users found</div>`;
        return;
    }

    const friendIds = new Set(state.friends.map(f => f.userId));
    const pendingIds = new Set(state.pending.map(f => f.userId));
    const sentIds = new Set(state.sent.map(f => f.userId));

    container.innerHTML = state.searchResults.map(u => {
        let actionHtml = '';
        if (friendIds.has(u._id)) {
            actionHtml = '<span class="px-3 py-1.5 text-[10px] font-bold text-[#00ff87]">FRIENDS</span>';
        } else if (sentIds.has(u._id)) {
            actionHtml = '<span class="px-3 py-1.5 text-[10px] font-bold text-yellow-400">PENDING</span>';
        } else if (pendingIds.has(u._id)) {
            actionHtml = '<span class="px-3 py-1.5 text-[10px] font-bold text-yellow-400">WANTS TO ADD YOU</span>';
        } else {
            actionHtml = `<button data-action="add" data-id="${u._id}" class="search-action-btn px-4 py-1.5 text-[10px] font-bold rounded-lg bg-[#00ff87]/20 text-[#00ff87] border border-[#00ff87]/30 hover:bg-[#00ff87]/30 transition-all">ADD FRIEND</button>`;
        }
        return `
            <div class="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-all">
                <img src="${avatar(u.nickname)}" class="w-9 h-9 rounded-full bg-white/5" alt="">
                <div class="flex-1 min-w-0">
                    <p class="text-white font-semibold text-sm truncate">${esc(u.nickname)}</p>
                    <p class="text-gray-500 text-[11px] truncate">${esc(u.email)}</p>
                </div>
                ${actionHtml}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.search-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.dataset.action === 'add') sendRequest(btn.dataset.id);
        });
    });
}

// ─── Search input ───

let searchTimeout = null;
const searchInput = document.getElementById('search-input');

searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value.trim();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchUsers(state.searchQuery), 300);
});

searchInput.addEventListener('blur', () => {
    setTimeout(() => {
        const container = document.getElementById('search-results');
        container.classList.add('hidden');
    }, 200);
});

searchInput.addEventListener('focus', () => {
    if (state.searchQuery.length >= 2) {
        document.getElementById('search-results').classList.remove('hidden');
    }
});

// ─── Nav active state ───

const navPlay = document.getElementById('nav-play');
if (navPlay) {
    navPlay.classList.remove('active', 'text-white');
    navPlay.classList.add('text-gray-400');
    const svg = navPlay.querySelector('svg');
    if (svg) svg.classList.remove('text-[#00ff87]');
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => { if (logout) logout(); });
}

// ─── Boot ───

renderTabs();
fetchAll();
