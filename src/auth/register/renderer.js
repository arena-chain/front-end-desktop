const { ipcRenderer } = require('electron');
const { register, getPrimaryRole } = require('../../../shared/api');

const registerForm = document.getElementById('registerForm');
const submitBtn = registerForm.querySelector('button[type="submit"]');
const btnBaseText = 'Create';

function showError(message) {
    let errEl = document.getElementById('register-error');
    if (!errEl) {
        errEl = document.createElement('p');
        errEl.id = 'register-error';
        errEl.className = 'text-red-500 text-xs font-semibold mt-2 text-center';
        submitBtn.insertAdjacentElement('afterend', errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'block';
}

function clearError() {
    const errEl = document.getElementById('register-error');
    if (errEl) errEl.style.display = 'none';
}

function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
        const currentText = submitBtn.textContent;
        submitBtn.dataset.originalText = currentText;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Creating account...`;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        submitBtn.textContent = submitBtn.dataset.originalText || 'Create Account';
        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

function getSelectedRole() {
    const checked = document.querySelector('input[name="role"]:checked');
    return checked ? checked.value : 'player';
}

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const role = getSelectedRole();
    const nickname = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!nickname || !email || !password || !confirmPassword) {
        showError('Please fill in all fields.');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match.');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    setLoading(true);

    try {
        const body = { email, password, nickname };

        if (role === 'player') {
            body.isPro = false;
            body.isVerified = false;
        }

        const data = await register(body, role);
        ipcRenderer.send('navigate-to', 'login');
    } catch (err) {
        const msg = err.body?.message
            ? (Array.isArray(err.body.message) ? err.body.message.join('. ') : err.body.message)
            : err.message || 'Registration failed. Please try again.';
        showError(msg);
    } finally {
        setLoading(false);
    }
});

document.getElementById('goToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'login');
});
