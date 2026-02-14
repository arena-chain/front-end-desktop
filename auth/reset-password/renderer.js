const { ipcRenderer } = require('electron');
const API_URL = 'http://localhost:3000';

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const email = localStorage.getItem('resetEmail');
    const otp = localStorage.getItem('resetOtp');

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, otp, newPassword: password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to reset password');
        }

        alert('Password reset successfully! Please log in with your new password.');

        // Clean up
        localStorage.removeItem('resetEmail');
        localStorage.removeItem('resetOtp');

        ipcRenderer.send('navigate-to', 'login');
    } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + err.message);
    }
});
