const { ipcRenderer } = require('electron');
const { requireAuth, getUser, logout } = require('../shared/api');

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
