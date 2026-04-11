// ============================================
// Main Server Entry Point
// ============================================
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection, pool } = require('./db');
const { verifyEmailConnection } = require('./email');
const authRoutes = require('./routes/auth');
const slotRoutes = require('./routes/slots');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'exam-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 2  // 2 hours
    }
}));

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint (for testing DB connection)
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 AS ok');
        res.json({ success: true, message: 'Server and database are healthy', db: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error', error: error.message });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Start Server
// ============================================
async function startServer() {
    // STEP 1: Database must connect (will exit if it fails)
    await testConnection();

    // STEP 2: Try to verify email connection (warn if it fails, don't crash)
    try {
        await verifyEmailConnection();
    } catch (err) {
        console.warn('⚠️  Email service WARNING:', err.message);
        console.warn('   The server will start, but OTP and notification emails will NOT work.');
        console.warn('   Fix your .env EMAIL_USER / EMAIL_PASS and restart the server.');
    }

    app.listen(PORT, () => {
        console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
        console.log(`📂 Open your browser and visit: http://localhost:${PORT}\n`);
    });
}

startServer();
