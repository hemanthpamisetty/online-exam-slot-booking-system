// ============================================
// Slot Booking Routes
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendBookingConfirmation } = require('../email');
const { asyncHandler } = require('../utils');

// Middleware
function isLoggedIn(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Please login first' });
    next();
}

function generateHallTicketNo() {
    return `HT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
}

// Routes
router.get('/', isLoggedIn, asyncHandler(async (req, res) => {
    const [slots] = await pool.query('SELECT *, (capacity - booked) AS available FROM slots WHERE exam_date >= CURDATE() ORDER BY exam_date ASC');
    res.json({ success: true, slots });
}));

router.post('/book', isLoggedIn, asyncHandler(async (req, res) => {
    const { slotId } = req.body;
    const userId = req.session.userId;

    const [slots] = await pool.query('SELECT * FROM slots WHERE id = ?', [slotId]);
    if (slots.length === 0 || slots[0].booked >= slots[0].capacity) {
        return res.status(400).json({ success: false, message: 'Slot unavailable' });
    }

    const hallTicketNo = generateHallTicketNo();
    const [result] = await pool.query('INSERT INTO bookings (user_id, slot_id, status, hall_ticket_no) VALUES (?, ?, "confirmed", ?)', [userId, slotId, hallTicketNo]);
    await pool.query('UPDATE slots SET booked = booked + 1 WHERE id = ?', [slotId]);

    // Async email
    const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    sendBookingConfirmation(users[0].email, { hall_ticket_no: hallTicketNo });

    res.json({ success: true, hallTicketNo });
}));

router.get('/my-bookings', isLoggedIn, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query('SELECT b.*, s.exam_name, s.exam_date, s.venue FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE b.user_id = ?', [req.session.userId]);
    res.json({ success: true, bookings });
}));

router.delete('/cancel/:bookingId', isLoggedIn, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query('SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = "confirmed"', [req.params.bookingId, req.session.userId]);
    if (bookings.length === 0) return res.status(404).json({ success: false, message: 'Booking not found' });

    await pool.query('UPDATE bookings SET status = "cancelled" WHERE id = ?', [req.params.bookingId]);
    await pool.query('UPDATE slots SET booked = booked - 1 WHERE id = ?', [bookings[0].slot_id]);

    res.json({ success: true, message: 'Cancelled' });
}));

module.exports = router;
