const { ipcRenderer } = require('electron');
const API_URL = 'http://localhost:3000';

const inputs = document.querySelectorAll('.otp-input');
inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            inputs[index - 1].focus();
        }
    });
});

document.getElementById('verifyOtpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = Array.from(inputs).map(i => i.value).join('');
    const email = localStorage.getItem('resetEmail');

    if (otp.length < 6) {
        alert('Please enter the full 6-digit code');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/verify-reset-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, otp })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Verification failed');
        }

        // Store OTP for reset password step
        localStorage.setItem('resetOtp', otp);

        ipcRenderer.send('navigate-to', 'reset-password');
    } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + err.message);
    }
});

document.getElementById('resendOtp').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = localStorage.getItem('resetEmail');

    try {
        const response = await fetch(`${API_URL}/auth/resend-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to resend OTP');
        }

        alert('OTP resent successfully!');
    } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + err.message);
    }
});
