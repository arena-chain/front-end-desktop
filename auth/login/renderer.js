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

// Initialize
generateQRCode();

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    // In a real app, validation and auth would happen here

    // For demo purposes, check specific emails to route to different dashboards
    let role = 'player'; // Default
    // Check specific credentials for Admin
    if (email === 'admin@gmail.com' && document.getElementById('password').value === '123456') {
        role = 'admin';
    }
    // Demo fallbacks (keep for testing other roles easily)
    else if (email.includes('referee')) role = 'referee';
    else if (email.includes('manager')) role = 'team_manager';

    ipcRenderer.send('login-success', { role });
});

document.getElementById('goToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'register');
});
