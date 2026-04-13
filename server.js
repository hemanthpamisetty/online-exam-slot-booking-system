// ============================================
// Main Server Entry Point (Production Ready)
// ============================================
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
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
const PORT = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Production Session Settings — backed by MySQL to avoid MemoryStore warnings
// and to support multiple replicas sharing session state.
const dbUrlForSession = (process.env.MYSQL_URL || process.env.DATABASE_URL || '').trim();
const sessionStoreOptions = {
    // express-mysql-session accepts a connection string directly
    ...(dbUrlForSession ? { uri: dbUrlForSession } : {
        host: (process.env.MYSQLHOST || process.env.DB_HOST || 'localhost').trim(),
        user: (process.env.MYSQLUSER || process.env.DB_USER || 'root').trim(),
        password: (process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '').trim(),
        database: (process.env.MYSQLDATABASE || process.env.DB_NAME || 'exam_system').trim(),
        port: parseInt(process.env.MYSQLPORT) || parseInt(process.env.DB_PORT) || 3306,
    }),
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
const sessionStore = new MySQLStore(sessionStoreOptions);

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

// A. Root Route (Task 2)
app.get('/', (req, res) => {
    // Return a simple message for status checks, then serve the file
    res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
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
// 3. Global Error Handling (Task 3 & 9)
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
