// ============================================
// Login Page JavaScript
// Handles: Direct login (email/register_number + password)
// No OTP required for login
// ============================================

const API = '';  // Same origin, no prefix needed

// DOM Elements
const loginForm = document.getElementById('loginForm');
const alertBox = document.getElementById('alertBox');

// ============================================
// Show alert message
// ============================================
function showAlert(message, type = 'error') {
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    // Auto-hide after 5 seconds
    setTimeout(() => { alertBox.classList.remove('show'); }, 5000);
}

// ============================================
// Check if already logged in
// ============================================
async function checkSession() {
    try {
        const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            // Already logged in, redirect
            if (data.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        }
    } catch (err) {
        // Not logged in, stay on login page
    }
}

// ============================================
// Submit login form (direct login, no OTP)
// ============================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        return showAlert('Please fill in all fields');
    }

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
        // Create an AbortController for timeout (15 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            showAlert('Login successful! Redirecting...', 'success');
            // Redirect based on role
            setTimeout(() => {
                if (data.user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            }, 1000);
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Connection error. Please try again.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Sign In';
    }
});

// Check session on page load
checkSession();
