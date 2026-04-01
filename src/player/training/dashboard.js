const { ipcRenderer } = require('electron');
const { apiRequest, requireAuth, getUser } = require('../../../shared/api');

// Auth Check
if (!requireAuth()) {
    throw new Error('Not authenticated');
}

let selectedDifficulty = 'MEDIUM';
let selectedDuration = 60;

// UI Elements
const difficultyBtns = document.querySelectorAll('.difficulty-btn');
const durationBtns = document.querySelectorAll('.duration-btn');
const startBtn = document.getElementById('start-btn');
const backBtn = document.getElementById('back-btn');
const leaderboardBody = document.getElementById('leaderboard-body');
const lbDifficultySelect = document.getElementById('lb-difficulty');
const soundToggle = document.getElementById('sound-toggle');

// Sound Configuration
let soundEnabled = localStorage.getItem('arena_sound_enabled') !== 'false';
updateSoundUI();

if (soundToggle) {
    soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('arena_sound_enabled', soundEnabled);
        updateSoundUI();
    });
}

function updateSoundUI() {
    const iconOn = document.getElementById('sound-icon-on');
    const iconOff = document.getElementById('sound-icon-off');
    const text = document.getElementById('sound-text');
    const indicator = document.getElementById('sound-indicator');

    if (soundEnabled) {
        iconOn.classList.remove('hidden');
        iconOff.classList.add('hidden');
        text.textContent = 'ENABLED';
        text.className = 'text-[#00ff87]';
        indicator.className = 'w-2 h-2 rounded-full bg-[#00ff87] shadow-[0_0_10px_#00ff87]';
    } else {
        iconOn.classList.add('hidden');
        iconOff.classList.remove('hidden');
        text.textContent = 'DISABLED';
        text.className = 'text-gray-500';
        indicator.className = 'w-2 h-2 rounded-full bg-gray-700';
    }
}

// Navigation
if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = '../match/matchmaking.html';
    });
}

// Setup toggle logic
difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        difficultyBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDifficulty = btn.dataset.value;
        fetchLeaderboard();
    });
});

durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        durationBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDuration = parseInt(btn.dataset.value);
    });
});

lbDifficultySelect.addEventListener('change', () => fetchLeaderboard());

async function fetchLeaderboard() {
    try {
        const difficulty = lbDifficultySelect.value || selectedDifficulty;
        const response = await apiRequest(`/training/leaderboard?difficulty=${difficulty}&limit=10`);
        const data = response.data || [];
        
        if (!data || data.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-gray-500">No one scored yet. Be the first!</td></tr>';
            return;
        }

        leaderboardBody.innerHTML = data.map((entry, index) => `
            <tr class="group hover:bg-white/[0.02] transition-colors">
                <td class="py-4 text-xs font-black ${index < 3 ? 'text-[#00ff87]' : 'text-gray-500'}">#${index + 1}</td>
                <td class="py-4">
                    <div class="flex items-center gap-3">
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(entry.username || 'Player')}&background=random" class="w-8 h-8 rounded-lg" />
                        <span class="text-sm font-bold text-gray-200">${entry.username || 'Unknown Agent'}</span>
                    </div>
                </td>
                <td class="py-4 text-sm font-black text-white">${(entry.score || 0).toLocaleString()}</td>
                <td class="py-4 text-sm font-bold text-[#00ff87]">${Math.floor(entry.accuracy || 0)}%</td>
                <td class="py-4"><span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-black tracking-tighter">${entry.difficulty || 'N/A'}</span></td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Training Leaderboard Error:', err);
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="5" class="py-10 text-center">
                    <p class="text-red-500/50 mb-2">Failed to connect to Neural Network HQ.</p>
                    <p class="text-[10px] text-gray-600 uppercase tracking-widest">${err.message || 'Unknown Error'}</p>
                </td>
            </tr>
        `;
    }
}

startBtn.addEventListener('click', () => {
    // Save selection for the game engine
    const config = {
        difficulty: selectedDifficulty,
        duration: selectedDuration,
        timestamp: Date.now()
    };
    localStorage.setItem('training_config', JSON.stringify(config));
    
    // Navigate via IPC
    ipcRenderer.send('navigate-to', 'training-game');
});

// Initial load
fetchLeaderboard();
