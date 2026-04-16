// ============================================
// Slot Booking Routes (Production Ready)
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendBookingConfirmation, sendCancellationNotification } = require('../email');
const { asyncHandler, isPositiveInt } = require('../utils');

// ============================================
// Middleware
// ============================================
function isLoggedIn(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Please login first' });
    next();
}

function generateHallTicketNo() {
    return `HT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
}

// ============================================
// GET /api/slots — List available slots
// ============================================
router.get('/', isLoggedIn, asyncHandler(async (req, res) => {
    const [slots] = await pool.query(
        'SELECT *, (capacity - booked) AS available FROM slots WHERE exam_date >= CURDATE() ORDER BY exam_date ASC, start_time ASC'
    );
    res.json({ success: true, slots });
}));

// ============================================
// POST /api/slots/book — Book a slot (Issue #3, #4, #13)
//   - Validates slotId
//   - Checks for duplicate booking
//   - Uses transaction + atomic UPDATE to prevent race condition
//   - Checks affectedRows to confirm booking
// ============================================
router.post('/book', isLoggedIn, asyncHandler(async (req, res) => {
    const { slotId } = req.body || {};
    const userId = req.session.userId;

    // --- Input validation (Issue #11) ---
    if (!slotId || !isPositiveInt(slotId)) {
        return res.status(400).json({ success: false, message: 'Valid slot ID is required' });
    }

    const slotIdNum = Number(slotId);

    // --- Start transaction (Issue #13) ---
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // --- Duplicate booking check (Issue #4) ---
        const [existingBooking] = await connection.query(
            'SELECT id FROM bookings WHERE user_id = ? AND slot_id = ? AND status = ?',
            [userId, slotIdNum, 'confirmed']
        );
        if (existingBooking.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'You have already booked this slot' });
        }

        // --- Atomic capacity check + increment (Issue #3) ---
        // This single UPDATE guarantees no overbooking even under concurrency
        const [updateResult] = await connection.query(
            'UPDATE slots SET booked = booked + 1 WHERE id = ? AND booked < capacity',
            [slotIdNum]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Slot is full or does not exist' });
        }

        // --- Create booking ---
        const hallTicketNo = generateHallTicketNo();
        await connection.query(
            'INSERT INTO bookings (user_id, slot_id, status, hall_ticket_no) VALUES (?, ?, ?, ?)',
            [userId, slotIdNum, 'confirmed', hallTicketNo]
        );

        await connection.commit();
        connection.release();

        // --- Async email (fire & forget) ---
        pool.query('SELECT email FROM users WHERE id = ?', [userId])
            .then(([users]) => {
                if (users.length > 0) {
                    sendBookingConfirmation(users[0].email, { hall_ticket_no: hallTicketNo });
                }
            })
            .catch(err => console.error('Booking email error:', err.message));

        res.json({ success: true, hallTicketNo, message: 'Slot booked successfully' });

    } catch (err) {
        await connection.rollback();
        connection.release();
        throw err; // Re-throw so asyncHandler sends 500
    }
}));

// ============================================
// GET /api/slots/my-bookings — List user's bookings
// ============================================
router.get('/my-bookings', isLoggedIn, asyncHandler(async (req, res) => {
    const [bookings] = await pool.query(
        `SELECT b.*, s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue 
         FROM bookings b 
         JOIN slots s ON b.slot_id = s.id 
         WHERE b.user_id = ? 
         ORDER BY b.booking_date DESC`,
        [req.session.userId]
    );
    res.json({ success: true, bookings });
}));

// ============================================
// DELETE /api/slots/cancel/:bookingId — Cancel a booking (Issue #5)
//   Uses GREATEST to prevent booked going negative
// ============================================
router.delete('/cancel/:bookingId', isLoggedIn, asyncHandler(async (req, res) => {
    const bookingId = req.params.bookingId;

    if (!isPositiveInt(bookingId)) {
        return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [bookings] = await connection.query(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = ?',
            [bookingId, req.session.userId, 'confirmed']
        );

        if (bookings.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Booking not found or already cancelled' });
        }

        await connection.query('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', bookingId]);
        // GREATEST prevents booked from going below 0 (Issue #5)
        await connection.query('UPDATE slots SET booked = GREATEST(booked - 1, 0) WHERE id = ?', [bookings[0].slot_id]);

        await connection.commit();
        connection.release();

        // Async email
        pool.query('SELECT email FROM users WHERE id = ?', [req.session.userId])
            .then(([users]) => {
                if (users.length > 0) sendCancellationNotification(users[0].email);
            })
            .catch(err => console.error('Cancel email error:', err.message));

        res.json({ success: true, message: 'Booking cancelled successfully' });

    } catch (err) {
        await connection.rollback();
        connection.release();
        throw err;
    }
}));

module.exports = router;
