const { ipcRenderer } = require('electron');

document.getElementById('logoutBtn').addEventListener('click', () => {
    ipcRenderer.send('navigate-to', 'login');
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
