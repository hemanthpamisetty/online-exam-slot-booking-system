// ============================================
// Forgot Password Page JavaScript
// 3-step flow: Email → OTP → New Password
// ============================================

const API = '';

const emailForm = document.getElementById('emailForm');
const otpSection = document.getElementById('otpSection');
const otpForm = document.getElementById('otpForm');
const passwordSection = document.getElementById('passwordSection');
const passwordForm = document.getElementById('passwordForm');
const alertBox = document.getElementById('alertBox');

let resetEmail = '';
let resendCountdown = null;

// ============================================
// Show alert message
// ============================================
function showAlert(message, type = 'error') {
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    setTimeout(() => { alertBox.classList.remove('show'); }, 5000);
}

// ============================================
// Step 1: Send OTP to email
// ============================================
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    if (!email) return showAlert('Please enter your email');

    const sendOtpBtn = document.getElementById('sendOtpBtn');
    sendOtpBtn.disabled = true;
    sendOtpBtn.innerHTML = '<span class="spinner"></span> Sending OTP...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            resetEmail = email;
            emailForm.style.display = 'none';
            otpSection.style.display = 'block';
            if (document.getElementById('maskedEmail')) {
                document.getElementById('maskedEmail').textContent = email;
            }
            showAlert('OTP sent to your email!', 'success');
            startResendTimer();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.innerHTML = 'Send OTP';
    }
});

// ============================================
// Step 2: Verify OTP
// ============================================
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const otp = document.getElementById('otpInput').value.trim();
    if (!otp || otp.length !== 6) return showAlert('Please enter a valid 6-digit OTP');

    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    verifyOtpBtn.disabled = true;
    verifyOtpBtn.innerHTML = '<span class="spinner"></span> Verifying...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, otp, purpose: 'reset' }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            otpSection.style.display = 'none';
            passwordSection.style.display = 'block';
            showAlert('OTP verified! Set your new password.', 'success');
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.innerHTML = 'Verify OTP';
    }
});

// ============================================
// Step 3: Set new password
// ============================================
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!newPassword || newPassword.length < 6) {
        return showAlert('Password must be at least 6 characters');
    }

    if (newPassword !== confirmPassword) {
        return showAlert('Passwords do not match');
    }

    const resetBtn = document.getElementById('resetBtn');
    resetBtn.disabled = true;
    resetBtn.innerHTML = '<span class="spinner"></span> Resetting...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, newPassword }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            showAlert('Password reset successfully! Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerHTML = 'Reset Password';
    }
});

// ============================================
// Resend OTP
// ============================================
async function resendOTP() {
    const resendBtn = document.getElementById('resendBtn');
    resendBtn.disabled = true;

    try {
        const res = await fetch(`${API}/api/auth/resend-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, purpose: 'reset' })
        });

        const data = await res.json();

        if (data.success) {
            showAlert('New OTP sent to your email!', 'success');
            startResendTimer();
        } else {
            showAlert(data.message);
            resendBtn.disabled = false;
        }
    } catch (err) {
        showAlert('Error resending OTP');
        resendBtn.disabled = false;
    }
}

// ============================================
// Resend timer (30 second cooldown)
// ============================================
function startResendTimer() {
    const resendBtn = document.getElementById('resendBtn');
    const timerSpan = document.getElementById('resendTimer');
    let seconds = 30;

    resendBtn.disabled = true;
    timerSpan.textContent = seconds;

    if (resendCountdown) clearInterval(resendCountdown);

    resendCountdown = setInterval(() => {
        seconds--;
        timerSpan.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(resendCountdown);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend OTP';
        }
    }, 1000);
}
