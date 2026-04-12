// ============================================
// Admin Routes
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { asyncHandler } = require('../utils');

// Middleware
function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Please login first' });
    if (req.session.userRole !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}

// Routes
router.get('/users', isAdmin, asyncHandler(async (req, res) => {
    const [users] = await pool.query('SELECT id, name, email, phone, register_number, role, is_verified, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users });
}));

router.get('/bookings', isAdmin, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query('SELECT b.id, b.hall_ticket_no, b.status, u.name AS student_name, s.exam_name, s.exam_date, s.venue FROM bookings b JOIN users u ON b.user_id = u.id JOIN slots s ON b.slot_id = s.id ORDER BY b.booking_date DESC');
    res.json({ success: true, bookings });
}));

router.get('/stats', isAdmin, asyncHandler(async (req, res) => {
    const [userCount] = await pool.query('SELECT COUNT(*) AS count FROM users WHERE role = "student"');
    const [bookingCount] = await pool.query('SELECT COUNT(*) AS count FROM bookings WHERE status = "confirmed"');
    const [slotCount] = await pool.query('SELECT COUNT(*) AS count FROM slots');
    const [cancelledCount] = await pool.query('SELECT COUNT(*) AS count FROM bookings WHERE status = "cancelled"');
    
    res.json({
        success: true,
        stats: {
            totalStudents: userCount[0].count,
            activeBookings: bookingCount[0].count,
            totalSlots: slotCount[0].count,
            cancelledBookings: cancelledCount[0].count
        }
    });
}));

router.post('/slots', isAdmin, asyncHandler(async (req, res) => {
    const { exam_name, exam_date, start_time, end_time, venue, capacity } = req.body;
    await pool.query('INSERT INTO slots (exam_name, exam_date, start_time, end_time, venue, capacity) VALUES (?, ?, ?, ?, ?, ?)', [exam_name, exam_date, start_time, end_time, venue, capacity]);
    res.json({ success: true, message: 'Slot created' });
}));

router.delete('/slots/:id', isAdmin, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query('SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = "confirmed"', [req.params.id]);
    if (bookings[0].count > 0) return res.status(400).json({ success: false, message: 'Cannot delete slot with active bookings' });
    
    await pool.query('DELETE FROM slots WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Slot deleted' });
}));

module.exports = router;
