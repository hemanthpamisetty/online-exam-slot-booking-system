// ============================================
// Admin Routes
// - View all users
// - View all bookings
// - View login logs
// - Create / Delete slots
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ============================================
// Middleware: Check if user is admin
// ============================================
function isAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Please login first' });
    }
    if (req.session.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}

// ============================================
// GET /api/admin/users
// View all registered users
// ============================================
router.get('/users', isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, name, email, phone, register_number, role, is_verified, created_at 
             FROM users ORDER BY created_at DESC`
        );

        res.json({ success: true, users });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET /api/admin/bookings
// View all bookings
// ============================================
router.get('/bookings', isAdmin, async (req, res) => {
    try {
        const [bookings] = await pool.query(
            `SELECT b.id, b.hall_ticket_no, b.status, b.booking_date,
                    u.name AS student_name, u.email AS student_email,
                    s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             JOIN slots s ON b.slot_id = s.id
             ORDER BY b.booking_date DESC`
        );

        res.json({ success: true, bookings });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET /api/admin/logs
// View all login logs
// ============================================
router.get('/logs', isAdmin, async (req, res) => {
    try {
        const [logs] = await pool.query(
            `SELECT l.id, l.email, l.login_time, l.ip_address,
                    u.name AS user_name
             FROM login_logs l
             JOIN users u ON l.user_id = u.id
             ORDER BY l.login_time DESC
             LIMIT 100`
        );

        res.json({ success: true, logs });

    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET /api/admin/slots
// View all slots (including past)
// ============================================
router.get('/slots', isAdmin, async (req, res) => {
    try {
        const [slots] = await pool.query(
            `SELECT *, (capacity - booked) AS available 
             FROM slots ORDER BY exam_date ASC`
        );

        res.json({ success: true, slots });

    } catch (error) {
        console.error('Error fetching slots:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// POST /api/admin/slots
// Create a new exam slot
// ============================================
router.post('/slots', isAdmin, async (req, res) => {
    try {
        const { exam_name, exam_date, start_time, end_time, venue, capacity } = req.body;

        if (!exam_name || !exam_date || !start_time || !end_time || !venue || !capacity) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        await pool.query(
            `INSERT INTO slots (exam_name, exam_date, start_time, end_time, venue, capacity) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [exam_name, exam_date, start_time, end_time, venue, parseInt(capacity)]
        );

        res.json({ success: true, message: 'Exam slot created successfully!' });

    } catch (error) {
        console.error('Error creating slot:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// DELETE /api/admin/slots/:id
// Delete an exam slot
// ============================================
router.delete('/slots/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if slot has active bookings
        const [activeBookings] = await pool.query(
            `SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = 'confirmed'`,
            [id]
        );

        if (activeBookings[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete: ${activeBookings[0].count} active booking(s) exist for this slot`
            });
        }

        await pool.query('DELETE FROM slots WHERE id = ?', [id]);

        res.json({ success: true, message: 'Slot deleted successfully' });

    } catch (error) {
        console.error('Error deleting slot:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET /api/admin/stats
// Dashboard statistics
// ============================================
router.get('/stats', isAdmin, async (req, res) => {
    try {
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

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
