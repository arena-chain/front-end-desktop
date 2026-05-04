const { ipcRenderer } = require('electron');
const { requireAuth, logout } = require('../../shared/api');

if (!requireAuth()) throw new Error('Not authenticated');

document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
});

// Sidebar Navigation
const overviewBtn = document.getElementById('nav-overview');
if (overviewBtn) {
    overviewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        ipcRenderer.send('navigate-to', 'admin-dashboard');
    });
}

const tournamentsBtn = document.getElementById('nav-tournaments');
if (tournamentsBtn) {
    tournamentsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        ipcRenderer.send('navigate-to', 'admin-tournaments');
    });
}
