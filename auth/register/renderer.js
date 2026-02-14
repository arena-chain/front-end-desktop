const { ipcRenderer } = require('electron');

const API_URL = 'http://localhost:3000';

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const region = document.getElementById('region').value;
    const password = document.getElementById('password').value;
    const role = document.querySelector('input[name="role"]:checked').value;

    try {
        const endpoint = role === 'player' ? '/auth/register/player' : '/auth/register';
        const body = { email, password, nickname, region, role };

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Registration failed');
        }

        const data = await response.json();
        const { accessToken, refreshToken } = data;

        // Store tokens
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        alert('Registration successful! Please log in.');
        ipcRenderer.send('navigate-to', 'login');
    } catch (err) {
        console.error('Registration error:', err);
        alert('Registration failed: ' + err.message);
    }
});

document.getElementById('goToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'login');
});
