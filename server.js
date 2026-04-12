// ============================================
// Main Server Entry Point (Production Ready)
// ============================================
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

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

// ============================================
// 1. Core Middleware
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Production Session Settings
app.use(session({
    secret: process.env.SESSION_SECRET || 'prod-secret-key-12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Only over HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 2 // 2 hours
    }
}));

// ============================================
// 2. Specialized Routes
// ============================================

// A. Root Route (Serve Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// B. Public Site
app.use(express.static(path.join(__dirname, 'public')));

// C. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/admin', adminRoutes);

// D. Health Check (Task 9)
app.get('/api/health', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'healthy', db: rows[0], uptime: process.uptime() });
}));

// ============================================
// 3. Global Error Handling (Task 3)
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ UNEXPECTED ERROR:', err.message);
    console.error(err.stack);
    
    res.status(err.status || 500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'production' ? 'Unexplained server error' : err.message
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
            console.log(`📡 Deployment Environment: ${process.env.NODE_ENV || 'production'}`);
            console.log(`--- Ready to handle requests ---\n`);
        });

        // Graceful Shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received. Shutting down gracefully...');
            server.close(() => {
                pool.end();
                process.exit(0);
            });
        });

    } catch (criticalError) {
        console.error('❌ CRITICAL STARTUP ERROR:', criticalError.message);
        process.exit(1);
    }
}

startApp();
