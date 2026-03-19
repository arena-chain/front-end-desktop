const { ipcRenderer } = require('electron');
const { requireAuth, logout } = require('../shared/api');

if (!requireAuth()) throw new Error('Not authenticated');

document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
});
