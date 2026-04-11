// ============================================
// Authentication Routes
// - Registration with Email OTP
// - Login (password only, no OTP)
// - Password Reset with Email OTP
// - Session management
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { pool } = require('../db');
const { sendOTPEmail, sendPasswordResetConfirmation } = require('../email');

// ============================================
// Helper: Generate 6-digit OTP
// ============================================
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// Helper: Save OTP to database and send email
// ============================================
async function createAndSendOTP(email, purpose) {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Invalidate any previous unused OTPs for this email and purpose
    await pool.query(
        'UPDATE otps SET is_used = 1 WHERE email = ? AND purpose = ? AND is_used = 0',
        [email, purpose]
    );

    // Save new OTP
    await pool.query(
        'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
        [email, otp, purpose, expiresAt]
    );

    // Send OTP via email (no fallback — this will throw if email fails)
    await sendOTPEmail(email, otp, purpose);

    return { otp, emailSent: true };
}

// ============================================
// POST /api/auth/register
// Step 1: Register a new user (sends OTP via email)
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, register_number } = req.body;

        // Validate input
        if (!name || !email || !password || !phone || !register_number) {
            return res.status(400).json({ success: false, message: 'All fields are required (name, email, password, phone, register number)' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Validate register_number: must be exactly 10 alphanumeric characters
        if (!/^[A-Za-z0-9]{10}$/.test(register_number)) {
            return res.status(400).json({ success: false, message: 'Register number must be exactly 10 alphanumeric characters' });
        }

        // Check if email already exists
        const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Check if register_number already exists
        const [existingReg] = await pool.query('SELECT id FROM users WHERE register_number = ?', [register_number]);
        if (existingReg.length > 0) {
            return res.status(400).json({ success: false, message: 'Register number already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user (not verified yet)
        await pool.query(
            'INSERT INTO users (name, email, password, phone, register_number, is_verified) VALUES (?, ?, ?, ?, ?, 0)',
            [name, email, hashedPassword, phone, register_number]
        );

        // Generate and send OTP via email
        await createAndSendOTP(email, 'register');

        res.json({
            success: true,
            message: 'Registration successful! OTP has been sent to your email.',
            emailSent: true
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration: ' + error.message });
    }
});

// ============================================
// POST /api/auth/verify-otp
// Step 2: Verify OTP (for registration or reset)
// ============================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, purpose } = req.body;

        if (!email || !otp || !purpose) {
            return res.status(400).json({ success: false, message: 'Email, OTP, and purpose are required' });
        }

        if (purpose !== 'register' && purpose !== 'reset') {
            return res.status(400).json({ success: false, message: 'Invalid purpose. Must be "register" or "reset".' });
        }

        // Find the latest unused OTP for this email and purpose
        const [otpRows] = await pool.query(
            `SELECT * FROM otps 
             WHERE email = ? AND otp = ? AND purpose = ? AND is_used = 0 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email, otp, purpose]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Mark OTP as used
        await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRows[0].id]);

        if (purpose === 'register') {
            // Verify the user account
            await pool.query('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);
            res.json({ success: true, message: 'Account verified successfully! You can now login.' });

        } else if (purpose === 'reset') {
            // OTP verified for password reset
            req.session.resetEmail = email;
            req.session.resetVerified = true;
            res.json({ success: true, message: 'OTP verified! You can now set a new password.' });
        }

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ success: false, message: 'Server error during OTP verification' });
    }
});

// ============================================
// POST /api/auth/resend-otp
// Resend OTP to email
// ============================================
router.post('/resend-otp', async (req, res) => {
    try {
        const { email, purpose } = req.body;

        if (!email || !purpose) {
            return res.status(400).json({ success: false, message: 'Email and purpose are required' });
        }

        if (purpose !== 'register' && purpose !== 'reset') {
            return res.status(400).json({ success: false, message: 'Invalid purpose' });
        }

        // Verify the email exists
        const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0 && purpose !== 'register') {
            return res.status(400).json({ success: false, message: 'Email not found' });
        }

        // Generate and send new OTP
        await createAndSendOTP(email, purpose);

        res.json({
            success: true,
            message: 'A new OTP has been sent to your email.',
            emailSent: true
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error resending OTP' });
    }
});

// ============================================
// POST /api/auth/login
// Login with email/register_number + password
// (No OTP required for login)
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email/Register Number and password are required' });
        }

        // Find user by email OR register_number
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR register_number = ?',
            [email, email]
        );
        if (users.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check if account is verified
        if (!user.is_verified) {
            return res.status(400).json({ success: false, message: 'Account not verified. Please verify your OTP first.' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        // Create session directly (no OTP step)
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        req.session.registerNumber = user.register_number;

        // Log the login
        const ip = req.ip || req.connection.remoteAddress;
        await pool.query(
            'INSERT INTO login_logs (user_id, email, ip_address) VALUES (?, ?, ?)',
            [user.id, user.email, ip]
        );

        res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                register_number: user.register_number
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// ============================================
// POST /api/auth/forgot-password
// Step 1: Request password reset (sends OTP via email)
// ============================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if user exists
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // Don't reveal whether email exists (security best practice)
            return res.json({
                success: true,
                message: 'If this email is registered, a password reset OTP has been sent.'
            });
        }

        // Check if account is verified
        if (!users[0].is_verified) {
            return res.status(400).json({
                success: false,
                message: 'This account has not been verified yet.'
            });
        }

        // Generate and send reset OTP via email
        await createAndSendOTP(email, 'reset');

        res.json({
            success: true,
            message: 'Password reset OTP has been sent to your email.',
            emailSent: true
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// POST /api/auth/reset-password
// Step 3: Set new password (after OTP verification)
// ============================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Verify that OTP was verified for this reset session
        if (!req.session.resetVerified || req.session.resetEmail !== email) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your OTP first before resetting password'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        const [result] = await pool.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Clear reset session flags
        delete req.session.resetEmail;
        delete req.session.resetVerified;

        // Send confirmation email
        await sendPasswordResetConfirmation(email);

        res.json({ success: true, message: 'Password reset successfully! You can now login with your new password.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error resetting password' });
    }
});

// ============================================
// GET /api/auth/me
// Get current logged-in user info
// ============================================
router.get('/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Not logged in' });
    }

    res.json({
        success: true,
        user: {
            id: req.session.userId,
            name: req.session.userName,
            email: req.session.userEmail,
            role: req.session.userRole,
            register_number: req.session.registerNumber
        }
    });
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

module.exports = router;
