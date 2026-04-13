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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone, register_number: registerNumber }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            registerEmail = email;
            // Show Success section, hide form
            registerForm.style.display = 'none';
            document.getElementById('successSection').style.display = 'block';
            showAlert('Registration successful! Awaiting admin verification.', 'success');
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
