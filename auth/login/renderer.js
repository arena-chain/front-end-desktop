const { ipcRenderer } = require('electron');
const QRCode = require('qrcode');

// Generate QR Code
const generateQRCode = async () => {
    const qrImage = document.getElementById('qr-code');
    // In a real app, this would be a session ID or a socket connection ID
    const loginSessionId = `arena-login-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        const url = await QRCode.toDataURL(loginSessionId, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        qrImage.src = url;
        console.log('QR Code generated for session:', loginSessionId);
    } catch (err) {
        console.error('Error generating QR code:', err);
        // Fallback or alert if generation fails
        qrImage.alt = "Failed to load QR Code";
    }
};

// Base URL for API
const API_URL = 'http://localhost:3000';

// Initialize
generateQRCode();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Login failed');
        }

        const data = await response.json();
        const { accessToken, refreshToken, user } = data;

        // Store tokens and user in localStorage
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));

        ipcRenderer.send('login-success', { role: user.role });
    } catch (err) {
        console.error('Login error:', err);
        alert('Login failed: ' + err.message);
    }
});

document.getElementById('googleLoginBtn').addEventListener('click', () => {
    window.location.href = `${API_URL}/auth/google`;
});

document.getElementById('steamLoginBtn').addEventListener('click', () => {
    window.location.href = `${API_URL}/auth/steam`;
});

document.getElementById('forgotPasswordBtn').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'forgot-password');
});

document.getElementById('goToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'register');
});
