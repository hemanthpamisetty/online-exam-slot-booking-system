// ============================================
// Registration Page JavaScript
// Handles: Register + OTP verification
// ============================================

const API = '';

const registerForm = document.getElementById('registerForm');
const otpSection = document.getElementById('otpSection');
const otpForm = document.getElementById('otpForm');
const alertBox = document.getElementById('alertBox');

let registerEmail = '';
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
// Step 1: Submit registration form
// ============================================
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const registerNumber = document.getElementById('registerNumber').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validations
    if (!name || !registerNumber || !email || !phone || !password || !confirmPassword) {
        return showAlert('Please fill in all fields');
    }

    // Register number: exactly 10 alphanumeric characters
    if (!/^[A-Za-z0-9]{10}$/.test(registerNumber)) {
        return showAlert('Register number must be exactly 10 alphanumeric characters (e.g. 21BCS10045)');
    }

    if (password.length < 6) {
        return showAlert('Password must be at least 6 characters');
    }

    if (password !== confirmPassword) {
        return showAlert('Passwords do not match');
    }

    const registerBtn = document.getElementById('registerBtn');
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="spinner"></span> Registering...';

    try {
        const res = await fetch(`${API}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone, register_number: registerNumber })
        });

        const data = await res.json();

        if (data.success) {
            registerEmail = email;
            // Show OTP section, hide form
            registerForm.style.display = 'none';
            otpSection.style.display = 'block';
            if (document.getElementById('maskedEmail')) {
                document.getElementById('maskedEmail').textContent = email;
            }
            showAlert('Registration successful! OTP has been sent to your email.', 'success');
            startResendTimer();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        registerBtn.disabled = false;
        registerBtn.innerHTML = 'Register';
    }
});

// ============================================
// Step 2: Verify registration OTP
// ============================================
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const otp = document.getElementById('otpInput').value.trim();

    if (!otp || otp.length !== 6) {
        return showAlert('Please enter a valid 6-digit OTP');
    }

    const verifyBtn = document.getElementById('verifyBtn');
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="spinner"></span> Verifying...';

    try {
        const res = await fetch(`${API}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registerEmail, otp, purpose: 'register' })
        });

        const data = await res.json();

        if (data.success) {
            showAlert('Account verified! Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = 'Verify & Complete Registration';
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
            body: JSON.stringify({ email: registerEmail, purpose: 'register' })
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
