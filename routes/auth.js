// ============================================
// Authentication Routes
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../db');
const { verifyEmailConnection, sendOTPEmail, sendPasswordResetConfirmation } = require('../email');
const { asyncHandler } = require('../utils');

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
// Routes
// ============================================

router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, phone, register_number } = req.body;

    if (!name || !email || !password || !phone || !register_number) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!/^[A-Za-z0-9]{10}$/.test(register_number)) {
        return res.status(400).json({ success: false, message: 'Register number must be 10 alphanumeric characters' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? OR register_number = ?', [email, register_number]);
    if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Email or Register Number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (name, email, password, phone, register_number, is_verified) VALUES (?, ?, ?, ?, ?, 0)', [name, email, hashedPassword, phone, register_number]);

    await createAndSendOTP(email, 'register');
    res.json({ success: true, message: 'OTP sent to your email.' });
}));

router.post('/verify-otp', asyncHandler(async (req, res) => {
    const { email, otp, purpose } = req.body;

    const [otpRow] = await pool.query(
        'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND is_used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [email, otp, purpose]
    );

    if (otpRow.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRow[0].id]);

    if (purpose === 'register') {
        await pool.query('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);
        res.json({ success: true, message: 'Account verified!' });
    } else {
        req.session.resetEmail = email;
        req.session.resetVerified = true;
        res.json({ success: true, message: 'OTP verified!' });
    }
}));

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const [users] = await pool.query('SELECT * FROM users WHERE email = ? OR register_number = ?', [email, email]);
    if (users.length === 0) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const user = users[0];
    if (!user.is_verified) return res.status(400).json({ success: false, message: 'Account not verified' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    await pool.query('INSERT INTO login_logs (user_id, email, ip_address) VALUES (?, ?, ?)', [user.id, user.email, req.ip]);

    res.json({ success: true, user: { name: user.name, role: user.role } });
}));

router.get('/me', asyncHandler(async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
    
    const [users] = await pool.query('SELECT id, name, email, role, register_number FROM users WHERE id = ?', [req.session.userId]);
    res.json({ success: true, user: users[0] });
}));

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// ============================================
// GET /api/auth/test-email-config
// Debug endpoint to verify SMTP credentials
// ============================================
router.get('/test-email-config', asyncHandler(async (req, res) => {
    const { verifyEmailConnection } = require('../email');
    await verifyEmailConnection();
    res.json({ 
        success: true, 
        message: '✅ Email configuration is CORRECT and connected!'
    });
}));

module.exports = router;
