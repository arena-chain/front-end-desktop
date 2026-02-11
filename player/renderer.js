const { ipcRenderer } = require('electron');

document.getElementById('logoutBtn').addEventListener('click', () => {
    ipcRenderer.send('navigate-to', 'login');
});
