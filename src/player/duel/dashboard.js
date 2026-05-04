const { ipcRenderer } = require('electron');
const { apiRequest, getUser } = require('../../../shared/api');
const duelSocket = require('../../../shared/duel-socket');

// Global State
let socket;
let currentLobbyCode = null;
let currentUserId = null;
let currentUserName = null;
let isPublicLobby = true;
let selectedDifficulty = 'MEDIUM';
let isInLobby = false;

// Error reporting
window.onerror = function(message, source, lineno, colno, error) {
    const errorToast = document.getElementById('error-toast');
    const errorMsg = document.getElementById('error-message');
    if (errorMsg) errorMsg.textContent = `CRITICAL UI ERROR: ${message}`.toUpperCase();
    if (errorToast) errorToast.classList.remove('hidden');
    console.error('[DuelDashboard] Fatal Error:', message, 'at', source, ':', lineno);
};

console.log('[DuelDashboard] Initializing engagement protocol...');

function initUI() {
    console.log('[DuelDashboard] Attaching UI listeners...');
    
    // Difficulty Selection
    const diffBtns = document.querySelectorAll('.difficulty-btn');
    diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            diffBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.dataset.value || btn.getAttribute('data-value');
        });
    });

    // Visibility Toggle
    const togglePublic = document.getElementById('toggle-public');
    const togglePrivate = document.getElementById('toggle-private');
    if (togglePublic && togglePrivate) {
        togglePublic.addEventListener('click', () => {
            isPublicLobby = true;
            togglePublic.classList.add('active');
            togglePublic.style.backgroundColor = '#00ff87';
            togglePublic.style.color = '#050505';
            togglePrivate.classList.remove('active');
            togglePrivate.style.backgroundColor = 'transparent';
            togglePrivate.style.color = '#fff';
        });
        togglePrivate.addEventListener('click', () => {
            isPublicLobby = false;
            togglePrivate.classList.add('active');
            togglePrivate.style.backgroundColor = '#00ff87';
            togglePrivate.style.color = '#050505';
            togglePublic.classList.remove('active');
            togglePublic.style.backgroundColor = 'transparent';
            togglePublic.style.color = '#fff';
        });
        togglePublic.click();
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            duelSocket.disconnect();
            window.location.href = require('../components/nav-config').href('dashboard');
        });
    }

    const createBtn = document.getElementById('create-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            if (!socket || !socket.connected) {
                showError('Searching for uplink... Please wait');
                return;
            }
            createBtn.disabled = true;
            createBtn.textContent = 'ESTABLISHING UPLINK...';
            socket.emit('duel:create', {
                userId: currentUserId,
                username: currentUserName,
                config: { difficulty: selectedDifficulty, duration: 60 },
                isPublic: isPublicLobby
            });
        });
    }

    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            const codeInput = document.getElementById('lobby-code-input');
            const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
            if (code.length === 6) {
                socket.emit('duel:join', { lobbyCode: code, userId: currentUserId, username: currentUserName });
            } else {
                showError('Enter a valid 6-digit code');
            }
        });
    }

    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.addEventListener('click', () => {
            if (!currentLobbyCode) return;
            socket.emit('duel:ready', { lobbyCode: currentLobbyCode, userId: currentUserId });
            readyBtn.disabled = true;
            readyBtn.textContent = 'WAITING...';
        });
    }

    const leaveBtn = document.getElementById('leave-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (!currentLobbyCode) return;
            socket.emit('duel:leave', { lobbyCode: currentLobbyCode, userId: currentUserId });
            resetToDashboard();
        });
    }

    const refreshBtn = document.getElementById('refresh-lobbies');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (socket && socket.connected) socket.emit('duel:list_public');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try { initUI(); } catch (err) { console.error('[DuelDashboard] UI Init failed:', err); }

    try {
        const user = getUser();
        if (user) {
            currentUserId = user.id || user._id;
            currentUserName = user.nickname || user.username || 'Agent';
            const nicknameEl = document.getElementById('user-nickname');
            if (nicknameEl) nicknameEl.textContent = currentUserName.toUpperCase();
        }
        socket = duelSocket.connect();
        setupSocketListeners();
    } catch (err) { console.error('[DuelDashboard] Core Init failed:', err); }
});

function setupSocketListeners() {
    if (!socket) return;

    socket.on('duel:lobby_created', (session) => {
        enterLobby(session);
        resetCreateButton();
    });

    socket.on('duel:player_joined', (session) => {
        if (!isInLobby) {
            enterLobby(session);
        } else {
            updateLobbyUI(session);
        }
    });

    socket.on('duel:player_ready', ({ userId, status }) => {
        const isLocal = userId === currentUserId;
        const readyEl = isLocal ? document.getElementById('p1-ready') : document.getElementById('p2-ready');
        if (readyEl) {
            readyEl.textContent = 'READY';
            readyEl.classList.remove('text-gray-500');
            readyEl.classList.add('text-[#00ff87]');
        }
        if (status === 'in_progress') {
            const statusPill = document.getElementById('lobby-status-pill');
            if (statusPill) statusPill.textContent = 'PREPARING COMBAT...';
        }
    });

    socket.on('duel:start', (data) => {
        localStorage.setItem('duel_config', JSON.stringify({
            ...data.config,
            startTimestamp: data.startTimestamp,
            lobbyCode: currentLobbyCode
        }));
        ipcRenderer.send('navigate-to', 'duel-game');
    });

    socket.on('duel:opponent_left', () => {
        showError('Opponent left the lobby');
        updateLobbyUI({ lobbyCode: currentLobbyCode, players: [ { userId: currentUserId, username: currentUserName, ready: false } ] });
    });

    socket.on('duel:public_lobbies', (lobbies) => {
        renderPublicLobbies(lobbies);
    });

    socket.on('duel:error', ({ message }) => {
        showError(message);
        resetCreateButton();
    });
}

function resetCreateButton() {
    const createBtn = document.getElementById('create-btn');
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.textContent = 'GENERATE LOBBY';
    }
}

function enterLobby(session) {
    isInLobby = true;
    currentLobbyCode = session.lobbyCode;
    
    // UI Update: Hide code if Public
    const codeContainer = document.getElementById('code-container');
    const publicStatus = document.getElementById('public-status');
    const codeEl = document.getElementById('display-code');

    if (session.isPublic) {
        if (codeContainer) codeContainer.classList.add('hidden');
        if (publicStatus) publicStatus.classList.remove('hidden');
    } else {
        if (codeContainer) codeContainer.classList.remove('hidden');
        if (publicStatus) publicStatus.classList.add('hidden');
        if (codeEl) codeEl.textContent = session.lobbyCode;
    }
    
    const lobbyView = document.getElementById('lobby-view');
    if (lobbyView) {
        lobbyView.classList.remove('hidden');
        lobbyView.scrollIntoView({ behavior: 'smooth' });
    }
    
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.disabled = false;
        readyBtn.textContent = 'I AM READY';
    }

    updateLobbyUI(session);
}

function updateLobbyUI(session) {
    const p1 = session.players[0];
    const p2 = session.players[1];

    if (p1) {
        const p1Name = document.getElementById('p1-name');
        if (p1Name) p1Name.textContent = p1.username.toUpperCase();
        const p1Ready = document.getElementById('p1-ready');
        if (p1Ready) {
            p1Ready.textContent = p1.ready ? 'READY' : 'NOT READY';
            p1Ready.className = p1.ready ? 'text-[10px] font-bold text-[#00ff87] uppercase tracking-widest' : 'text-[10px] font-bold text-gray-500 uppercase tracking-widest';
        }
    }

    const p2Card = document.getElementById('p2-card');
    const p2Name = document.getElementById('p2-name');
    const p2Ready = document.getElementById('p2-ready');
    
    if (p2) {
        if (p2Card) p2Card.classList.remove('opacity-40');
        if (p2Name) p2Name.textContent = p2.username.toUpperCase();
        if (p2Ready) {
            p2Ready.textContent = p2.ready ? 'READY' : 'NOT READY';
            p2Ready.className = p2.ready ? 'text-[10px] font-bold text-[#00ff87] uppercase tracking-widest' : 'text-[10px] font-bold text-gray-500 uppercase tracking-widest';
        }
    } else {
        if (p2Card) p2Card.classList.add('opacity-40');
        if (p2Name) p2Name.textContent = 'SEARCHING...';
        if (p2Ready) {
            p2Ready.textContent = 'NOT READY';
            p2Ready.className = 'text-[10px] font-bold text-gray-500 uppercase tracking-widest';
        }
    }
}

function renderPublicLobbies(lobbies) {
    const list = document.getElementById('public-lobbies-list');
    if (!list) return;
    if (lobbies.length === 0) {
        list.innerHTML = '<div class="py-8 text-center text-gray-600 text-[10px] font-black uppercase tracking-[0.2em]">Searching for signals...</div>';
        return;
    }
    list.innerHTML = lobbies.map(l => `
        <div class="lobby-row glass-panel p-4 rounded-2xl flex justify-between items-center transition-all">
            <div>
                <p class="text-xs font-black text-gray-200">${(l.lobbyName || 'ARENA MATCH').toUpperCase()}</p>
                <div class="flex gap-2 mt-1">
                    <span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-gray-500 uppercase">${l.config.difficulty}</span>
                    <span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#00ff87]/5 border border-[#00ff87]/10 text-[#00ff87] uppercase">${l.players.length}/2 PLAYERS</span>
                </div>
            </div>
            <button onclick="joinByCode('${l.lobbyCode}')" class="px-3 py-1.5 rounded-lg bg-[#00ff87]/10 border border-[#00ff87]/20 text-[#00ff87] text-[9px] font-black hover:bg-[#00ff87] hover:text-[#050505] transition-all">
                JOIN ARENA
            </button>
        </div>
    `).join('');
}

window.joinByCode = (code) => {
    if (socket && socket.connected) {
        socket.emit('duel:join', { lobbyCode: code, userId: currentUserId, username: currentUserName });
    }
};

function resetToDashboard() {
    isInLobby = false;
    currentLobbyCode = null;
    const lobbyView = document.getElementById('lobby-view');
    if (lobbyView) lobbyView.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(msg) {
    const toast = document.getElementById('error-toast');
    const msgEl = document.getElementById('error-message');
    if (msgEl) msgEl.textContent = msg.toUpperCase();
    if (toast) {
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 5000);
    }
}
