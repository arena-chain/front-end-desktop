const { ipcRenderer } = require('electron');

const API_URL = 'http://localhost:3000'; // Default, ideally loaded from config

const REGIONS = [
    { code: 'EUROPE', name: 'Europe' },
    { code: 'AFRICA', name: 'Afrique' },
    { code: 'ASIA', name: 'Asie' },
    { code: 'AMERICAS', name: 'Amériques' },
    { code: 'OCEANIA', name: 'Océanie' }
];

const AVATAR_PRESETS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Dusty',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Mario',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=Sasha',
];

let currentUser = { avatar: '', nickname: '', region: 'EUROPE' };
let isEditing = false;
let activeTab = 'resume';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    populateRegions();
    populatePresets();
    setupEventListeners();
    loadProfile();
});

function populateRegions() {
    const select = document.getElementById('editRegion');
    if (!select) return;

    select.innerHTML = '';
    REGIONS.forEach(r => {
        const option = document.createElement('option');
        option.value = r.code;
        option.textContent = r.name;
        select.appendChild(option);
    });
}

function populatePresets() {
    const container = document.getElementById('avatarPresets');
    if (!container) return;

    container.innerHTML = '';
    AVATAR_PRESETS.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'w-10 h-10 rounded-full border-2 border-white/5 hover:border-white/20 transition-all overflow-hidden';
        btn.innerHTML = `<img src="${p}" class="w-full h-full object-cover">`;
        btn.onclick = () => {
            currentUser.avatar = p; // Update temp avatar in current user object
            updateAvatarPreview(p);
        };
        container.appendChild(btn);
    });
}

function updateAvatarPreview(url) {
    const avatarImg = document.getElementById('profileAvatar');
    const defaultAvatar = document.getElementById('defaultAvatar');
    if (url && url.trim() !== '') {
        avatarImg.src = url;
        avatarImg.classList.remove('hidden');
        defaultAvatar.classList.add('hidden');
    } else {
        avatarImg.classList.add('hidden');
        defaultAvatar.classList.remove('hidden');
    }
}

function generateRandomAvatar() {
    const styles = ['avataaars', 'bottts', 'pixel-art', 'lorelei', 'adventurer', 'miniavs'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    const randomSeed = Math.random().toString(36).substring(7);
    const newAvatar = `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${randomSeed}`;
    if (!currentUser) currentUser = {};
    currentUser.avatar = newAvatar;
    updateAvatarPreview(newAvatar);
}

function handleAvatarFileChange(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            currentUser.avatar = reader.result;
            updateAvatarPreview(currentUser.avatar);
        };
        reader.readAsDataURL(file);
    }
}

function getToken() {
    return localStorage.getItem('accessToken');
}

async function loadProfile() {
    try {
        const token = getToken();
        if (!token) {
            console.error('No token found');
            // Try load from local storage
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                currentUser = JSON.parse(storedUser);
                updateUI(currentUser);
            }
            return;
        }

        const response = await fetch(`${API_URL}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch profile');

        const data = await response.json();
        currentUser = data;
        localStorage.setItem('user', JSON.stringify(data)); // Update local storage
        updateUI(data);
    } catch (error) {
        console.error('Error loading profile:', error);
        // Fallback to local storage if available
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            updateUI(currentUser);
        }
    }
}

function updateUI(user) {
    if (!user) return;

    // View Mode Info
    const nicknameEl = document.getElementById('profileNickname');
    if (nicknameEl) nicknameEl.textContent = user.nickname || user.username || 'Player';

    const regionData = REGIONS.find(r => r.code === (user.region || 'EUROPE'));
    const regionEl = document.getElementById('profileRegion');
    if (regionEl) regionEl.textContent = regionData ? regionData.name : (user.region || '-');

    // Avatar
    updateAvatarPreview(user.avatar);

    // Stats (Mocked or real if available)
    const statsMatches = document.getElementById('statsMatches');
    const statsWins = document.getElementById('statsWins');
    if (statsMatches && user.profile) statsMatches.textContent = user.profile.matchesCount || '0';
    if (statsWins && user.profile) statsWins.textContent = user.profile.winRate ? `${user.profile.winRate}%` : '0';

    // Edit Inputs
    const editNickname = document.getElementById('editNickname');
    const editRegion = document.getElementById('editRegion');

    if (editNickname) editNickname.value = user.nickname || '';
    if (editRegion) editRegion.value = user.region || 'EUROPE';
}

function setupEventListeners() {
    // Edit/Save/Cancel Buttons
    const startEditBtn = document.getElementById('startEditBtn');
    if (startEditBtn) startEditBtn.addEventListener('click', () => toggleEditMode(true));

    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => toggleEditMode(false));

    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);

    // Tab Navigation
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = tab.dataset.tab;
            if (target) switchTab(target);
        });
    });

    // Navigation Links (Sidebar)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            ipcRenderer.send('navigate-to', 'login');
        });
    }

    const dashboardLink = document.getElementById('dashboardLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            ipcRenderer.send('navigate-to', 'player-dashboard'); // Sending generic message, main process decides
        });
    }

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            ipcRenderer.send('navigate-to', 'player-dashboard');
        });
    }

    const leaguesLink = document.getElementById('leaguesLink');
    if (leaguesLink) {
        leaguesLink.addEventListener('click', (e) => {
            e.preventDefault();
            ipcRenderer.send('navigate-to', 'player-leagues');
        });
    }

    const generateAvatarBtn = document.getElementById('generateAvatarBtn');
    if (generateAvatarBtn) {
        generateAvatarBtn.addEventListener('click', generateRandomAvatar);
    }

    const editAvatarOverlay = document.getElementById('editAvatarOverlay');
    if (editAvatarOverlay) {
        editAvatarOverlay.addEventListener('click', generateRandomAvatar);
    }

    const importAvatarBtn = document.getElementById('importAvatarBtn');
    if (importAvatarBtn) {
        importAvatarBtn.addEventListener('click', () => {
            document.getElementById('avatarFileInput').click();
        });
    }

    const avatarFileInput = document.getElementById('avatarFileInput');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', handleAvatarFileChange);
    }
}

function toggleEditMode(edit) {
    isEditing = edit;

    const viewModeInfo = document.getElementById('viewModeInfo');
    const editModeInputs = document.getElementById('editModeInputs');
    const viewModeButtons = document.getElementById('viewModeButtons');
    const editModeButtons = document.getElementById('editModeButtons');
    const editAvatarOverlay = document.getElementById('editAvatarOverlay');

    if (edit) {
        if (viewModeInfo) viewModeInfo.classList.add('hidden');
        if (editModeInputs) editModeInputs.classList.remove('hidden');
        if (viewModeButtons) viewModeButtons.classList.add('hidden');
        if (editModeButtons) {
            editModeButtons.classList.remove('hidden');
            editModeButtons.classList.add('flex');
        }
        if (editAvatarOverlay) editAvatarOverlay.classList.remove('hidden');
    } else {
        if (viewModeInfo) viewModeInfo.classList.remove('hidden');
        if (editModeInputs) editModeInputs.classList.add('hidden');
        if (viewModeButtons) viewModeButtons.classList.remove('hidden');
        if (editModeButtons) {
            editModeButtons.classList.add('hidden');
            editModeButtons.classList.remove('flex');
        }
        if (editAvatarOverlay) editAvatarOverlay.classList.add('hidden');

        // Reset inputs to current user data
        if (currentUser) updateUI(currentUser);
    }
}

async function saveProfile() {
    const nicknameInput = document.getElementById('editNickname');
    const regionInput = document.getElementById('editRegion');

    const nickname = nicknameInput ? nicknameInput.value : '';
    const region = regionInput ? regionInput.value : '';
    const avatar = currentUser.avatar || '';

    const token = getToken();
    if (!token) {
        alert('You are not logged in.');
        return;
    }

    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
    }

    try {
        const response = await fetch(`${API_URL}/auth/profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ nickname, region, avatar })
        });

        if (!response.ok) throw new Error('Failed to update profile');

        // Reload profile to get updated data
        await loadProfile();
        toggleEditMode(false);
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Failed to update profile. Please try again.');
    } finally {
        if (saveBtn) {
            saveBtn.textContent = 'Sauvegarder';
            saveBtn.disabled = false;
        }
    }
}

function switchTab(tabId) {
    activeTab = tabId;

    // Update Tab Buttons
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const isSelected = btn.dataset.tab === tabId;
        const widthClass = isSelected ? 'bg-[#00FF00]/5' : '';
        const textClass = isSelected ? 'text-[#00FF00]' : 'text-gray-500 hover:text-white hover:bg-white/5';

        // Remove existing indicator
        const existingIndicator = btn.querySelector('.absolute.bottom-0');
        if (existingIndicator) existingIndicator.remove();

        // Reset classes
        btn.className = `tab-btn px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all relative ${textClass} ${widthClass}`;

        if (isSelected) {
            const div = document.createElement('div');
            div.className = 'absolute bottom-0 left-0 right-0 h-0.5 bg-[#00FF00]';
            btn.appendChild(div);
        }
    });

    // Update Tab Content
    const contents = ['resume', 'matches', 'stats', 'leagues', 'tournaments'];
    contents.forEach(id => {
        const el = document.getElementById(`tabContent-${id}`);
        if (el) {
            if (id === tabId) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    });
}
