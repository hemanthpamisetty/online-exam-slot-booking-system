// ============================================
// Authentication Routes (Production Ready)
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../db');
const { sendOTPEmail, sendPasswordResetConfirmation } = require('../email');
const { asyncHandler, isValidEmail } = require('../utils');

// ============================================
// Helpers
// ============================================
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createAndSendOTP(email, purpose) {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query('UPDATE otps SET is_used = 1 WHERE email = ? AND purpose = ? AND is_used = 0', [email, purpose]);
    await pool.query('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)', [email, otp, purpose, expiresAt]);
    
    // Non-blocking email attempt
    await sendOTPEmail(email, otp, purpose);
    return { otp };
}

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, phone, register_number } = req.body || {};

    // --- Validation (Issue #9, #10) ---
    if (!name || !email || !password || !phone || !register_number) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (!/^[A-Za-z0-9]{10}$/.test(register_number)) {
        return res.status(400).json({ success: false, message: 'Register number must be 10 alphanumeric characters' });
    }

    // --- Duplicate check ---
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? OR register_number = ?', [trimmedEmail, register_number]);
    if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Email or Register Number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
        'INSERT INTO users (name, email, password, phone, register_number, is_verified) VALUES (?, ?, ?, ?, ?, 0)',
        [name.trim(), trimmedEmail, hashedPassword, phone.trim(), register_number.trim()]
    );

    res.json({ success: true, message: 'Registration successful! Your account is pending administrator verification. You will receive an email once verified.' });
}));

// ============================================
// POST /api/auth/verify-otp
// ============================================
router.post('/verify-otp', asyncHandler(async (req, res) => {
    const { email, otp, purpose } = req.body || {};

    if (!email || !otp || !purpose) {
        return res.status(400).json({ success: false, message: 'Email, OTP, and purpose are required' });
    }

    const [otpRow] = await pool.query(
        'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND is_used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [email.trim().toLowerCase(), otp, purpose]
    );

    if (otpRow.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRow[0].id]);

    if (purpose === 'register') {
        await pool.query('UPDATE users SET is_verified = 1 WHERE email = ?', [email.trim().toLowerCase()]);
        res.json({ success: true, message: 'Account verified!' });
    } else {
        req.session.resetEmail = email.trim().toLowerCase();
        req.session.resetVerified = true;
        res.json({ success: true, message: 'OTP verified!' });
    }
}));

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const [users] = await pool.query('SELECT * FROM users WHERE email = ? OR register_number = ?', [trimmedEmail, email.trim()]);
    if (users.length === 0) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    if (user.role === 'student' && !user.is_verified) {
        return res.status(403).json({ success: false, message: 'Your account is pending administrator verification.' });
    }

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    // Log login attempt (fire & forget)
    pool.query('INSERT INTO login_logs (user_id, email, ip_address) VALUES (?, ?, ?)', [user.id, user.email, req.ip])
        .catch(err => console.error('Login log error:', err.message));

    res.json({ success: true, user: { name: user.name, role: user.role } });
}));

// ============================================
// GET /api/auth/me (Issue #8 — handle deleted user)
// ============================================
router.get('/me', asyncHandler(async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
    
    const [users] = await pool.query('SELECT id, name, email, role, register_number FROM users WHERE id = ?', [req.session.userId]);

    if (users.length === 0) {
        // User was deleted after session was created — destroy stale session
        req.session.destroy(() => {});
        return res.status(401).json({ success: false, message: 'User no longer exists. Please log in again.' });
    }

    res.json({ success: true, user: users[0] });
}));

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// ============================================
// POST /api/auth/forgot-password (Issue #14 — was missing)
// ============================================
router.post('/forgot-password', asyncHandler(async (req, res) => {
    const { email } = req.body || {};

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (users.length === 0) {
        // Don't reveal whether the email exists
        return res.json({ success: true, message: 'If an account with that email exists, an OTP has been sent.' });
    }

    await createAndSendOTP(trimmedEmail, 'reset');
    res.json({ success: true, message: 'If an account with that email exists, an OTP has been sent.' });
}));

// ============================================
// POST /api/auth/reset-password (Issue #14 — was missing)
// ============================================
router.post('/reset-password', asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body || {};

    if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Verify OTP
    const [otpRow] = await pool.query(
        'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND is_used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [trimmedEmail, otp, 'reset']
    );

    if (otpRow.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRow[0].id]);

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const [result] = await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, trimmedEmail]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Fire & forget confirmation email
    sendPasswordResetConfirmation(trimmedEmail).catch(err => console.error('Reset email error:', err.message));

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
}));

// ============================================
// GET /api/auth/test-email-config (Issue #17 — gate behind admin)
// ============================================
router.get('/test-email-config', asyncHandler(async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { verifyEmailConnection } = require('../email');
    await verifyEmailConnection();
    res.json({ 
        success: true, 
        message: '✅ Email configuration is CORRECT and connected!'
    });
}));

module.exports = router;
