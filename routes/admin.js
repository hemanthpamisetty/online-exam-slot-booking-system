// ============================================
// Admin Routes (Production Ready)
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { asyncHandler, isPositiveInt, isValidDate, isValidTime } = require('../utils');
const { sendAccountVerifiedEmail } = require('../email');

// ============================================
// Middleware
// ============================================
function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Please login first' });
    if (req.session.userRole !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}

// ============================================
// GET /api/admin/users — List all users
// ============================================
router.get('/users', isAdmin, asyncHandler(async (req, res) => {
    const [users] = await pool.query(
        'SELECT id, name, email, phone, register_number, role, is_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
}));

// ============================================
// POST /api/admin/verify-user/:id — Verify a student
// ============================================
router.post('/verify-user/:id', isAdmin, asyncHandler(async (req, res) => {
    const userId = req.params.id;

    if (!isPositiveInt(userId)) {
        return res.status(400).json({ success: false, message: 'Valid user ID is required' });
    }

    // Get user email before updating
    const [users] = await pool.query('SELECT email, is_verified FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    
    const user = users[0];
    if (user.is_verified) return res.status(400).json({ success: false, message: 'User is already verified' });

    // Update status
    await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);

    // Send email (non-blocking)
    sendAccountVerifiedEmail(user.email).catch(err => console.error('Verification Email Error:', err.message));

    res.json({ success: true, message: 'User verified successfully and notification email sent.' });
}));

// ============================================
// GET /api/admin/bookings — List all bookings
// ============================================
router.get('/bookings', isAdmin, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query(`
        SELECT 
            b.id, b.hall_ticket_no, b.status, b.booking_date,
            u.name AS student_name, u.email AS student_email,
            s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue 
        FROM bookings b 
        JOIN users u ON b.user_id = u.id 
        JOIN slots s ON b.slot_id = s.id 
        ORDER BY b.booking_date DESC
    `);
    res.json({ success: true, bookings });
}));

// ============================================
// GET /api/admin/stats — Dashboard statistics (Issue #12 — optimized to single query)
// ============================================
router.get('/stats', isAdmin, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'student') AS totalStudents,
            (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') AS activeBookings,
            (SELECT COUNT(*) FROM slots) AS totalSlots,
            (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled') AS cancelledBookings
    `);
    
    res.json({ success: true, stats: rows[0] });
}));

// ============================================
// POST /api/admin/slots — Create a new slot (Issue #7 — full validation)
// ============================================
router.post('/slots', isAdmin, asyncHandler(async (req, res) => {
    const { exam_name, exam_date, start_time, end_time, venue, capacity } = req.body || {};

    // --- Full input validation ---
    const errors = [];

    if (!exam_name || typeof exam_name !== 'string' || exam_name.trim().length === 0) {
        errors.push('Exam name is required');
    }
    if (!exam_date || !isValidDate(exam_date)) {
        errors.push('Valid exam date (YYYY-MM-DD) is required');
    }
    if (!start_time || !isValidTime(start_time)) {
        errors.push('Valid start time (HH:MM) is required');
    }
    if (!end_time || !isValidTime(end_time)) {
        errors.push('Valid end time (HH:MM) is required');
    }
    if (!venue || typeof venue !== 'string' || venue.trim().length === 0) {
        errors.push('Venue is required');
    }
    if (!capacity || !isPositiveInt(capacity)) {
        errors.push('Capacity must be a positive integer');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    // Validate end_time > start_time
    if (start_time >= end_time) {
        return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }

    await pool.query(
        'INSERT INTO slots (exam_name, exam_date, start_time, end_time, venue, capacity) VALUES (?, ?, ?, ?, ?, ?)',
        [exam_name.trim(), exam_date.trim(), start_time.trim(), end_time.trim(), venue.trim(), parseInt(capacity)]
    );
    res.json({ success: true, message: 'Slot created successfully' });
}));

// ============================================
// GET /api/admin/slots — List all slots (for admin view)
// ============================================
router.get('/slots', isAdmin, asyncHandler(async (req, res) => {
    const [slots] = await pool.query(
        'SELECT * FROM slots ORDER BY exam_date ASC, start_time ASC'
    );
    res.json({ success: true, slots });
}));

// ============================================
// DELETE /api/admin/slots/:id — Delete a slot
// ============================================
router.delete('/slots/:id', isAdmin, asyncHandler(async (req, res) => {
    const slotId = req.params.id;

    if (!isPositiveInt(slotId)) {
        return res.status(400).json({ success: false, message: 'Valid slot ID is required' });
    }

    const [bookings] = await pool.query(
        'SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = ?',
        [slotId, 'confirmed']
    );
    if (bookings[0].count > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete slot with active bookings' });
    }
    
    const [result] = await pool.query('DELETE FROM slots WHERE id = ?', [slotId]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Slot not found' });
    }

    res.json({ success: true, message: 'Slot deleted successfully' });
}));

// ============================================
// GET /api/admin/logs — List login logs
// ============================================
router.get('/logs', isAdmin, asyncHandler(async (req, res) => {
    const [logs] = await pool.query(`
        SELECT l.id, l.email, l.ip_address, l.login_time, u.name AS user_name
        FROM login_logs l
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.login_time DESC
        LIMIT 100
    `);
    res.json({ success: true, logs });
}));

module.exports = router;
