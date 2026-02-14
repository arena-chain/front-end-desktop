const { ipcRenderer } = require('electron');
const API_URL = 'http://localhost:3000';

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;

    try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to send OTP');
        }

        // Store email for verification step
        localStorage.setItem('resetEmail', email);

        ipcRenderer.send('navigate-to', 'verify-otp');
    } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + err.message);
    }
});

document.getElementById('backToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'login');
});
