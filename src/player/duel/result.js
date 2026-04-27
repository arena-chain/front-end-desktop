const { ipcRenderer } = require('electron');
const { getUser } = require('../../../shared/api');

function initResult() {
    try {
        const session = JSON.parse(localStorage.getItem('last_duel_result'));
        const user = getUser();
        const currentUserId = user ? (String(user.id || user._id)) : null;

        if (!session) {
            console.error('[DuelResult] No session data found');
            return;
        }

        console.log('[DuelResult] Initializing result view for session:', session.lobbyCode);

        // Sort so local player is always on the left card (p1 area)
        const players = session.players || [];
        const localPlayer = players.find(p => String(p.userId) === currentUserId || (p.userId && String(p.userId._id) === currentUserId));
        const opponent = players.find(p => String(p.userId) !== currentUserId && (p.userId && String(p.userId._id) !== currentUserId));

        if (localPlayer) renderPlayer(localPlayer, 'p1');
        if (opponent) renderPlayer(opponent, 'p2');

        // Winner Title Logic
        const titleEl = document.getElementById('winner-title');
        const nameEl = document.getElementById('winner-name');

        const winnerIdStr = session.winnerId ? String(session.winnerId) : null;

        if (!winnerIdStr) {
            if (titleEl) {
                titleEl.textContent = 'DRAW';
                titleEl.className = 'text-9xl font-black italic tracking-tighter leading-none mb-4 uppercase text-gray-400';
            }
            if (nameEl) nameEl.textContent = 'NEITHER PLAYER SECURED DOMINANCE';
        } else if (winnerIdStr === currentUserId) {
            if (titleEl) {
                titleEl.textContent = 'VICTORY';
                titleEl.className = 'text-9xl font-black italic tracking-tighter leading-none mb-4 uppercase text-neon';
            }
            if (nameEl) nameEl.textContent = 'YOU HAVE SECURED THE UPLINK';
            const crown = document.getElementById('p1-crown');
            if (crown) crown.classList.remove('hidden');
            const card = document.getElementById('p1-result-card');
            if (card) card.classList.add('winner-card');
        } else {
            if (titleEl) {
                titleEl.textContent = 'DEFEAT';
                titleEl.className = 'text-9xl font-black italic tracking-tighter leading-none mb-4 uppercase text-defeat';
            }
            if (nameEl) nameEl.textContent = 'THE OPPONENT HAS TAKEN CONTROL';
            const crown = document.getElementById('p2-crown');
            if (crown) crown.classList.remove('hidden');
            const card = document.getElementById('p2-result-card');
            if (card) card.classList.add('winner-card');
        }

    } catch (err) {
        console.error('[DuelResult] Initialization error:', err);
    }
}

function renderPlayer(p, prefix) {
    try {
        if (!p) return;
        const nameEl = document.getElementById(`${prefix}-name`);
        if (nameEl) nameEl.textContent = (p.username || 'AGENT').toUpperCase();
        
        const scoreEl = document.getElementById(`${prefix}-score`);
        if (scoreEl) scoreEl.textContent = (p.score || 0).toLocaleString();
        
        const accEl = document.getElementById(`${prefix}-acc`);
        if (accEl) accEl.textContent = `${Math.floor(p.accuracy || 0)}%`;
        
        const respEl = document.getElementById(`${prefix}-resp`);
        if (respEl) respEl.textContent = `${p.avgResponseTime || 0}ms`;
        
        const perfEl = document.getElementById(`${prefix}-perfects`);
        if (perfEl) perfEl.textContent = p.perfectHits || 0;
        
        // Grade
        const gradeEl = document.getElementById(`${prefix}-grade`);
        if (gradeEl) gradeEl.textContent = calculateGrade(p.accuracy || 0);
    } catch (renderErr) {
        console.error('[DuelResult] Player render error:', renderErr);
    }
}

function calculateGrade(acc) {
    if (acc >= 90) return 'S';
    if (acc >= 75) return 'A';
    if (acc >= 60) return 'B';
    if (acc >= 45) return 'C';
    return 'D';
}

// Attach listeners
const dashboardBtn = document.getElementById('dashboard-btn');
if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
        ipcRenderer.send('navigate-to', 'duel-dashboard');
    });
}

const rematchBtn = document.getElementById('rematch-btn');
if (rematchBtn) {
    rematchBtn.addEventListener('click', () => {
        ipcRenderer.send('navigate-to', 'duel-dashboard');
    });
}

// Run init
initResult();
