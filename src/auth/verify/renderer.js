const { ipcRenderer } = require('electron');
const { apiRequest, storeAuth, getPrimaryRole } = require('../../../shared/api');

const email = localStorage.getItem('arena_pending_verify_email') || '';
const emailDisplay = document.getElementById('verify-email-display');
if (emailDisplay) emailDisplay.textContent = email || 'your email';

const inputs = document.querySelectorAll('.otp-input');
const verifyBtn = document.getElementById('verify-btn');
const errorEl = document.getElementById('verify-error');
const successEl = document.getElementById('verify-success');
const resendBtn = document.getElementById('resend-btn');
const resendMsg = document.getElementById('resend-msg');

function getOtp() {
    return Array.from(inputs).map(i => i.value).join('');
}

function updateSubmitState() {
    const otp = getOtp();
    verifyBtn.disabled = otp.length !== 6;
}

inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.slice(0, 1);
        e.target.classList.toggle('filled', !!e.target.value);

        if (val && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
        }
        updateSubmitState();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
            inputs[idx - 1].focus();
            inputs[idx - 1].value = '';
            inputs[idx - 1].classList.remove('filled');
            updateSubmitState();
        }
    });

    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        pasted.split('').forEach((ch, i) => {
            if (inputs[i]) {
                inputs[i].value = ch;
                inputs[i].classList.toggle('filled', !!ch);
            }
        });
        const focusIdx = Math.min(pasted.length, inputs.length - 1);
        inputs[focusIdx].focus();
        updateSubmitState();
    });
});

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    successEl.classList.add('hidden');
}

function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
}

function clearMessages() {
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
}

function setLoading(loading) {
    verifyBtn.disabled = loading;
    if (loading) {
        verifyBtn.dataset.orig = verifyBtn.textContent;
        verifyBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Verifying...';
    } else {
        verifyBtn.textContent = verifyBtn.dataset.orig || 'Verify & Create Account';
    }
}

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const otp = getOtp();
    if (otp.length !== 6) {
        showError('Please enter the full 6-digit code.');
        return;
    }

    if (!email) {
        showError('Email not found. Please register again.');
        return;
    }

    setLoading(true);

    try {
        const data = await apiRequest('/auth/verify-email', {
            method: 'POST',
            body: JSON.stringify({ email, otp }),
        });

        if (data.accessToken) {
            storeAuth(data.accessToken, data.refreshToken, data.user || null);
            localStorage.removeItem('arena_pending_verify_email');

            showSuccess('Account created! Redirecting...');

            setTimeout(() => {
                const role = getPrimaryRole(data.user?.roles) || data.user?.role || 'player';
                ipcRenderer.send('login-success', { role });
            }, 800);
        } else {
            showSuccess(data.message || 'Email verified! You can now log in.');
            localStorage.removeItem('arena_pending_verify_email');

            setTimeout(() => {
                ipcRenderer.send('navigate-to', 'login');
            }, 1500);
        }
    } catch (err) {
        let msg = err.body?.message || err.message || 'Verification failed.';
        if (Array.isArray(msg)) msg = msg.join('. ');
        showError(msg);
    } finally {
        setLoading(false);
    }
});

let resendCooldown = 0;
let resendTimer = null;

function startResendCooldown() {
    resendCooldown = 60;
    resendBtn.disabled = true;
    resendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    resendMsg.classList.remove('hidden');

    resendTimer = setInterval(() => {
        resendCooldown--;
        if (resendCooldown <= 0) {
            clearInterval(resendTimer);
            resendBtn.disabled = false;
            resendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            resendMsg.classList.add('hidden');
        } else {
            resendMsg.textContent = `You can resend in ${resendCooldown}s`;
        }
    }, 1000);
}

resendBtn.addEventListener('click', async () => {
    if (resendCooldown > 0 || !email) return;
    clearMessages();

    try {
        await apiRequest('/auth/resend-otp', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
        showSuccess('New code sent! Check your inbox.');
        startResendCooldown();
    } catch (err) {
        let msg = err.body?.message || err.message || 'Could not resend code.';
        if (Array.isArray(msg)) msg = msg.join('. ');
        showError(msg);
    }
});

document.getElementById('back-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('arena_pending_verify_email');
    ipcRenderer.send('navigate-to', 'register');
});
