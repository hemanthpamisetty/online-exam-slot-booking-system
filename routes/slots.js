// ============================================
// Slot Booking Routes
// - View available slots
// - Book a slot (+ email notification)
// - Reschedule booking (+ email notification)
// - Cancel booking (+ email notification)
// - View my bookings
// - Get hall ticket
// ============================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const {
    sendBookingConfirmation,
    sendRescheduleNotification,
    sendCancellationNotification
} = require('../email');

// ============================================
// Middleware: Check if user is logged in
// ============================================
function isLoggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Please login first' });
    }
    next();
}

// ============================================
// Helper: Generate Hall Ticket Number
// Format: HT-YYYY-XXXXX (e.g. HT-2026-00042)
// ============================================
function generateHallTicketNo() {
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    return `HT-${year}-${random}`;
}

// ============================================
// GET /api/slots
// Get all available exam slots
// ============================================
router.get('/', isLoggedIn, async (req, res) => {
    try {
        const [slots] = await pool.query(
            `SELECT id, exam_name, exam_date, start_time, end_time, venue, capacity, booked,
                    (capacity - booked) AS available
             FROM slots
             WHERE exam_date >= CURDATE()
             ORDER BY exam_date ASC, start_time ASC`
        );

        res.json({ success: true, slots });

    } catch (error) {
        console.error('Error fetching slots:', error);
        res.status(500).json({ success: false, message: 'Server error fetching slots' });
    }
});

// ============================================
// POST /api/slots/book
// Book a slot (with email notification)
// ============================================
router.post('/book', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { slotId } = req.body;

        if (!slotId) {
            return res.status(400).json({ success: false, message: 'Slot ID is required' });
        }

        // Check if slot exists
        const [slots] = await pool.query('SELECT * FROM slots WHERE id = ?', [slotId]);
        if (slots.length === 0) {
            return res.status(404).json({ success: false, message: 'Slot not found' });
        }

        const slot = slots[0];

        // Check capacity
        if (slot.booked >= slot.capacity) {
            return res.status(400).json({ success: false, message: 'This slot is fully booked. No seats available.' });
        }

        // Check for duplicate booking (same user, same slot, active booking)
        const [existingBooking] = await pool.query(
            `SELECT * FROM bookings 
             WHERE user_id = ? AND slot_id = ? AND status = 'confirmed'`,
            [userId, slotId]
        );

        if (existingBooking.length > 0) {
            return res.status(400).json({ success: false, message: 'You have already booked this slot!' });
        }

        // Check if user already has a confirmed booking for any slot on the same date
        const [sameDateBooking] = await pool.query(
            `SELECT b.*, s.exam_name FROM bookings b
             JOIN slots s ON b.slot_id = s.id
             WHERE b.user_id = ? AND b.status = 'confirmed' AND s.exam_date = ?`,
            [userId, slot.exam_date]
        );

        if (sameDateBooking.length > 0) {
            return res.status(400).json({
                success: false,
                message: `You already have a booking for "${sameDateBooking[0].exam_name}" on this date. Please reschedule or cancel it first.`
            });
        }

        // Generate hall ticket number
        const hallTicketNo = generateHallTicketNo();

        // Create booking
        const [insertResult] = await pool.query(
            `INSERT INTO bookings (user_id, slot_id, status, hall_ticket_no) 
             VALUES (?, ?, 'confirmed', ?)`,
            [userId, slotId, hallTicketNo]
        );

        // Increment booked count
        await pool.query('UPDATE slots SET booked = booked + 1 WHERE id = ?', [slotId]);

        // Fetch full ticket data for email
        const [userData] = await pool.query('SELECT name, email, register_number, phone FROM users WHERE id = ?', [userId]);
        const user = userData[0];

        // Send booking confirmation email
        try {
            await sendBookingConfirmation(user.email, {
                hall_ticket_no: hallTicketNo,
                student_name: user.name,
                register_number: user.register_number,
                exam_name: slot.exam_name,
                exam_date: slot.exam_date,
                start_time: slot.start_time,
                end_time: slot.end_time,
                venue: slot.venue,
                booking_id: insertResult.insertId
            });
        } catch (emailErr) {
            console.error('Failed to send booking email:', emailErr.message);
            // Don't fail the booking if email fails
        }

        res.json({
            success: true,
            message: 'Slot booked successfully! Hall ticket has been sent to your email.',
            hallTicketNo: hallTicketNo
        });

    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ success: false, message: 'Server error during booking' });
    }
});

// ============================================
// GET /api/slots/my-bookings
// Get all bookings for the logged-in user
// ============================================
router.get('/my-bookings', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.userId;

        const [bookings] = await pool.query(
            `SELECT b.id, b.hall_ticket_no, b.status, b.booking_date,
                    s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue
             FROM bookings b
             JOIN slots s ON b.slot_id = s.id
             WHERE b.user_id = ?
             ORDER BY b.booking_date DESC`,
            [userId]
        );

        res.json({ success: true, bookings });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ success: false, message: 'Server error fetching bookings' });
    }
});

// ============================================
// PUT /api/slots/reschedule
// Reschedule a booking (with email notification)
// ============================================
router.put('/reschedule', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { bookingId, newSlotId } = req.body;

        if (!bookingId || !newSlotId) {
            return res.status(400).json({ success: false, message: 'Booking ID and new Slot ID are required' });
        }

        // Verify the booking belongs to this user and is confirmed
        const [bookings] = await pool.query(
            `SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = 'confirmed'`,
            [bookingId, userId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found or already cancelled' });
        }

        const oldSlotId = bookings[0].slot_id;

        // Can't reschedule to the same slot
        if (oldSlotId === parseInt(newSlotId)) {
            return res.status(400).json({ success: false, message: 'You are already booked in this slot' });
        }

        // Get old slot details (for email)
        const [oldSlots] = await pool.query('SELECT * FROM slots WHERE id = ?', [oldSlotId]);
        const oldSlot = oldSlots[0];

        // Check new slot exists and has capacity
        const [newSlots] = await pool.query('SELECT * FROM slots WHERE id = ?', [newSlotId]);
        if (newSlots.length === 0) {
            return res.status(404).json({ success: false, message: 'New slot not found' });
        }

        const newSlot = newSlots[0];

        if (newSlot.booked >= newSlot.capacity) {
            return res.status(400).json({ success: false, message: 'New slot is fully booked' });
        }

        // Check for duplicate booking in the new slot
        const [dupCheck] = await pool.query(
            `SELECT * FROM bookings WHERE user_id = ? AND slot_id = ? AND status = 'confirmed'`,
            [userId, newSlotId]
        );

        if (dupCheck.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have a booking for the new slot' });
        }

        // Mark old booking as rescheduled
        await pool.query(
            `UPDATE bookings SET status = 'rescheduled' WHERE id = ?`,
            [bookingId]
        );

        // Decrease old slot booked count
        await pool.query('UPDATE slots SET booked = booked - 1 WHERE id = ?', [oldSlotId]);

        // Generate new hall ticket
        const hallTicketNo = generateHallTicketNo();

        // Create new booking
        await pool.query(
            `INSERT INTO bookings (user_id, slot_id, status, hall_ticket_no) 
             VALUES (?, ?, 'confirmed', ?)`,
            [userId, newSlotId, hallTicketNo]
        );

        // Increase new slot booked count
        await pool.query('UPDATE slots SET booked = booked + 1 WHERE id = ?', [newSlotId]);

        // Send reschedule email
        try {
            const [userData] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
            await sendRescheduleNotification(userData[0].email, oldSlot, newSlot, hallTicketNo);
        } catch (emailErr) {
            console.error('Failed to send reschedule email:', emailErr.message);
        }

        res.json({
            success: true,
            message: 'Booking rescheduled successfully! Details sent to your email.',
            hallTicketNo: hallTicketNo
        });

    } catch (error) {
        console.error('Reschedule error:', error);
        res.status(500).json({ success: false, message: 'Server error during reschedule' });
    }
});

// ============================================
// DELETE /api/slots/cancel/:bookingId
// Cancel a booking (with email notification)
// ============================================
router.delete('/cancel/:bookingId', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { bookingId } = req.params;

        // Verify the booking belongs to this user and is confirmed
        const [bookings] = await pool.query(
            `SELECT b.*, s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue
             FROM bookings b
             JOIN slots s ON b.slot_id = s.id
             WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'`,
            [bookingId, userId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found or already cancelled' });
        }

        const booking = bookings[0];
        const slotId = booking.slot_id;

        // Mark booking as cancelled
        await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);

        // Decrease slot booked count
        await pool.query('UPDATE slots SET booked = booked - 1 WHERE id = ?', [slotId]);

        // Send cancellation email
        try {
            const [userData] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
            await sendCancellationNotification(userData[0].email, {
                hall_ticket_no: booking.hall_ticket_no,
                exam_name: booking.exam_name,
                exam_date: booking.exam_date,
                start_time: booking.start_time,
                end_time: booking.end_time,
                venue: booking.venue
            });
        } catch (emailErr) {
            console.error('Failed to send cancellation email:', emailErr.message);
        }

        res.json({ success: true, message: 'Booking cancelled successfully. Notification sent to your email.' });

    } catch (error) {
        console.error('Cancel error:', error);
        res.status(500).json({ success: false, message: 'Server error during cancellation' });
    }
});

// ============================================
// GET /api/slots/hall-ticket/:bookingId
// Get hall ticket details for a booking
// ============================================
router.get('/hall-ticket/:bookingId', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { bookingId } = req.params;

        const [tickets] = await pool.query(
            `SELECT b.id, b.hall_ticket_no, b.status, b.booking_date,
                    s.exam_name, s.exam_date, s.start_time, s.end_time, s.venue,
                    u.name AS student_name, u.email AS student_email, 
                    u.phone AS student_phone, u.register_number
             FROM bookings b
             JOIN slots s ON b.slot_id = s.id
             JOIN users u ON b.user_id = u.id
             WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'`,
            [bookingId, userId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, message: 'Hall ticket not found or booking not confirmed' });
        }

        res.json({ success: true, ticket: tickets[0] });

    } catch (error) {
        console.error('Hall ticket error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching hall ticket' });
    }
});

module.exports = router;
