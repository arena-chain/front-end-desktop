const { ipcRenderer } = require('electron');
const QRCode = require('qrcode');
const { login, getPrimaryRole, getBaseUrl, getArenaBaseOrigin } = require('../../../shared/api');

// Generate QR Code
const generateQRCode = async () => {
    const qrCanvas = document.getElementById('qr-code');
    const qrLoading = document.getElementById('qr-loading');
    const loginSessionId = `arena-login-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        await QRCode.toCanvas(qrCanvas, loginSessionId, {
            width: 192,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        qrCanvas.classList.remove('hidden');
        if (qrLoading) qrLoading.style.display = 'none';
    } catch (err) {
        console.error('Error generating QR code:', err);
        if (qrLoading) qrLoading.innerHTML = '<p style="color:#f87171;font-size:12px;text-align:center;padding:8px;">QR unavailable</p>';
    }
};

generateQRCode();

const loginForm = document.getElementById('loginForm');
const submitBtn = loginForm.querySelector('button[type="submit"]');
const btnOriginalText = submitBtn.innerHTML;
const passwordInput = document.getElementById('password');
const togglePasswordVisibilityBtn = document.getElementById('togglePasswordVisibility');
const eyeIconOpen = document.getElementById('eyeIconOpen');
const eyeIconClosed = document.getElementById('eyeIconClosed');

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

togglePasswordVisibilityBtn.addEventListener('click', () => {
    const shouldShowPassword = passwordInput.type === 'password';
    passwordInput.type = shouldShowPassword ? 'text' : 'password';
    eyeIconOpen.classList.toggle('hidden', shouldShowPassword);
    eyeIconClosed.classList.toggle('hidden', !shouldShowPassword);
    togglePasswordVisibilityBtn.setAttribute(
        'aria-label',
        shouldShowPassword ? 'Hide password' : 'Show password'
    );
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError('Please fill in all fields.');
        return;
    }

    setLoading(true);

    // Timeout for the login request to prevent getting stuck
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Login timed out. Please check your connection or server status.')), 15000)
    );

    try {
        console.log('Attempting login for:', email);
        const data = await Promise.race([
            login(email, password),
            timeoutPromise
        ]);
        
        console.log('Login successful, determining role...');
        const role = getPrimaryRole(data.user?.roles);
        console.log('Redirecting for role:', role);
        
        ipcRenderer.send('login-success', { role });
    } catch (err) {
        console.error('Login error:', err, '| API:', getBaseUrl(), '| origin:', getArenaBaseOrigin());
        if (err.networkError) {
            showError(
                `Cannot reach the API at ${getArenaBaseOrigin()}. Start the Nest backend (port 3000), check arena-api.json, or run: localStorage.removeItem("arena_base_url") then reload.`
            );
            setLoading(false);
            return;
        }
        const fallback =
            err.status === 401 ? 'Invalid email or password.' : 'Something went wrong. Please try again.';
        const msg =
            err.message && !String(err.message).startsWith('Request failed')
                ? err.message
                : fallback;
        showError(msg);
        setLoading(false); // Ensure loading is cleared on error
    } finally {
        // We only clear loading if we haven't navigated away
        // If ipcRenderer.send was successful, the page will change
    }
});

document.getElementById('goToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'register');
});
