const { ipcRenderer } = require('electron');

// Populate user data
const storedUser = localStorage.getItem('user');
if (storedUser) {
    const user = JSON.parse(storedUser);
    const nicknameElements = document.querySelectorAll('header h3, .text-right h3');
    const roleElements = document.querySelectorAll('header p, .text-right p');

    nicknameElements.forEach(el => el.textContent = user.nickname || 'Player');
    roleElements.forEach(el => el.textContent = user.role?.toUpperCase().replace('_', ' ') || 'PRO PLAYER');

    // Initial in avatar circle
    const avatarCircle = document.querySelector('.w-8.h-8.bg-green-900');
    if (avatarCircle) {
        avatarCircle.textContent = (user.nickname || 'P').charAt(0).toUpperCase();
    }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    ipcRenderer.send('navigate-to', 'login');
});

document.getElementById('profileLink').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'player-profile');
});

document.getElementById('leaguesLink').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'player-leagues');
});
