// ============================================
// Main Server Entry Point (Production Ready)
// ============================================
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Fix for Node >= 17 DNS resolution issues (ENOTFOUND, IPv6 vs IPv4)
require('node:dns').setDefaultResultOrder('ipv4first');

// ============================================
// 0. Global Process Error Handlers (Issue #6)
//    Prevents unhandled errors from crashing the process
// ============================================
process.on('uncaughtException', (err) => {
    console.error(`\n💥 [UNCAUGHT EXCEPTION] ${new Date().toISOString()}`);
    console.error('   Error:', err.message);
    console.error('   Stack:', err.stack);
    // In production, log and stay alive; in dev, crash for visibility
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\n💥 [UNHANDLED REJECTION] ${new Date().toISOString()}`);
    console.error('   Reason:', reason);
});

// Imports
const { initializeDatabase, pool } = require('./db');
const { verifyEmailConnection } = require('./email');
const { asyncHandler } = require('./utils');

// Routes
const authRoutes = require('./routes/auth');
const slotRoutes = require('./routes/slots');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Debugging DB_HOST directly underneath dotenv initialization:
console.log("DB_HOST:", process.env.DB_HOST);

// ============================================
// 1. Core Middleware (Issue #1, #2)
//    express.json(), express.urlencoded(), cors() were MISSING
// ============================================
app.set('trust proxy', 1); // Trust Railway reverse proxy for secure cookies

app.use(cors({
    origin: true,          // Reflect the request origin
    credentials: true      // Allow cookies to be sent cross-origin
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Production Session Settings — backed by MySQL to avoid MemoryStore warnings
// and to support multiple replicas sharing session state.
const sessionStoreOptions = {
    expiration: 1000 * 60 * 60 * 24, // 24 hours (matches cookie maxAge)
    createDatabaseTable: true,        // Auto-create the `sessions` table
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
};
// Use the existing pool to inherit SSL/pooling settings
const sessionStore = new MySQLStore(sessionStoreOptions, pool);

app.use(session({
    secret: process.env.SESSION_SECRET || 'prod-secret-key-98765',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'exam_session', // Custom cookie name
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// ============================================
// 2. Specialized Routes
// ============================================

// A. Root Route
app.get('/', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// B. Public Site
app.use(express.static(path.join(__dirname, 'public')));

// C. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/admin', adminRoutes);

// D. Health Check
app.get('/api/health', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'healthy', db: rows[0], uptime: process.uptime() });
}));

// E. Email Diagnostic Test (TEMPORARY - remove after debugging)
app.get('/api/test-email', async (req, res) => {
    const testTo = req.query.to;
    if (!testTo) return res.status(400).json({ error: 'Add ?to=your@email.com to the URL' });

    const nodemailer = require('nodemailer');
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        return res.json({ error: 'EMAIL_USER or EMAIL_PASS not set in Railway variables' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass }
        });

        await transporter.verify();
        
        const info = await transporter.sendMail({
            from: user,
            to: testTo,
            subject: 'Raw SMTP Test',
            text: 'This was sent using raw Gmail SMTP Port 465.'
        });

        res.json({
            success: true,
            message: 'Connected to Gmail SMTP and sent email!',
            messageId: info.messageId,
            user: user
        });

    } catch (err) {
        res.json({ 
            success: false, 
            error: 'Failed to connect to Gmail SMTP', 
            details: err.message,
            code: err.code,
            command: err.command
        });
    }
});


// ============================================
// 3. Global Error Handling
// ============================================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Resource not found' });
});

// Global Error Catch-all
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`\n❌ [ERROR] ${new Date().toISOString()}`);
    console.error(`   Path: ${req.path}`);
    console.error(`   Message: ${message}`);
    if (NODE_ENV !== 'production') console.error(err.stack);

    res.status(status).json({
        success: false,
        message: NODE_ENV === 'production' ? 'An unexpected server error occurred' : message,
        error: NODE_ENV === 'production' ? null : err.stack
    });
});

// ============================================
// 4. Server Initialization (Async Start)
// ============================================
async function startApp() {
    try {
        console.log('\n--- 🚀 Starting Exam Booking System ---');

        // Step 1: Initialize Database
        await initializeDatabase();

        // Step 2: Initialize Email Service
        await verifyEmailConnection();

        // Step 3: Listen on 0.0.0.0
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Server is LIVE on 0.0.0.0:${PORT}`);
            console.log(`📡 Deployment Environment: ${NODE_ENV}`);
            console.log(`--- Ready to handle requests ---\n`);
        });

        // Graceful Shutdown (SIGTERM for Railway, SIGINT for local Ctrl+C)
        const shutdown = (signal) => {
            console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
            server.close(() => {
                pool.end();
                process.exit(0);
            });
            // Force exit after 10s if graceful shutdown hangs
            setTimeout(() => process.exit(1), 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (criticalError) {
        console.error('❌ CRITICAL STARTUP ERROR:', criticalError.message);
        process.exit(1);
    }
}

// Export app for testing
module.exports = app;

startApp();
