const { ipcRenderer } = require('electron');

document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const role = document.querySelector('input[name="role"]:checked').value;

    // Mock successful registration
    ipcRenderer.send('login-success', { role });
});

document.getElementById('goToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'login');
});
