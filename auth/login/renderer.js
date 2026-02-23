const { ipcRenderer } = require('electron');
const QRCode = require('qrcode');
const { login, getPrimaryRole } = require('../../shared/api');

// Generate QR Code
const generateQRCode = async () => {
    const qrImage = document.getElementById('qr-code');
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
    } catch (err) {
        console.error('Error generating QR code:', err);
        qrImage.alt = "Failed to load QR Code";
    }
};

generateQRCode();

const loginForm = document.getElementById('loginForm');
const submitBtn = loginForm.querySelector('button[type="submit"]');
const btnOriginalText = submitBtn.innerHTML;

function showError(message) {
    let errEl = document.getElementById('login-error');
    if (!errEl) {
        errEl = document.createElement('p');
        errEl.id = 'login-error';
        errEl.className = 'text-red-500 text-xs font-semibold mt-2 text-center';
        loginForm.appendChild(errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'block';
}

function clearError() {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'none';
}

function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Signing in...`;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        submitBtn.innerHTML = btnOriginalText;
        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showError('Please fill in all fields.');
        return;
    }

    setLoading(true);

    try {
        const data = await login(email, password);
        const role = getPrimaryRole(data.user?.roles);
        ipcRenderer.send('login-success', { role });
    } catch (err) {
        const msg = err.status === 401
            ? 'Invalid email or password.'
            : err.message || 'Something went wrong. Please try again.';
        showError(msg);
    } finally {
        setLoading(false);
    }
});

document.getElementById('goToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'register');
});
