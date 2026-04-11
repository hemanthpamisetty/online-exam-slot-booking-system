// ============================================
// Database Connection Module
// ============================================
const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================
// Database configuration
// ============================================

// Priority: Railway MYSQL_URL > Railway individual vars > Custom DB_ vars > Defaults
const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

const DB_CONFIG = dbUrl ? dbUrl : {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'Hemu@123',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'exam_system',
    port: parseInt(process.env.MYSQLPORT) || parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10
};

// Create a connection pool
const pool = mysql.createPool(DB_CONFIG);

// ============================================
// Initialize database: create DB and tables if missing
// ============================================
async function initializeDatabase() {
    // In production (like Railway), we typically don't have permission to CREATE DATABASE 
    // and the database name is pre-allocated. We only try to create DB if not using a URL 
    // and not in a clearly restricted environment.
    
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

    if (!dbUrl && !isProduction) {
        // Dev logic: try to create database if it doesn't exist
        const initPool = mysql.createPool({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            port: DB_CONFIG.port
        });

        try {
            const conn = await initPool.getConnection();
            console.log('✅ MySQL connected (init phase)');
            await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
            console.log(`✅ Database "${DB_CONFIG.database}" ready`);
            conn.release();
            await initPool.end();
        } catch (error) {
            console.warn('⚠️  Could not run CREATE DATABASE (normal on some cloud providers):', error.message);
            try { await initPool.end(); } catch(e) {}
            // Continue anyway, createTables will fail later if DB doesn't exist
        }
    }

    try {
        // Verify connection and create tables
        console.log('⏳ Connecting to database and verifying tables...');
        await createTables();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('\n📋 Troubleshooting:');
        console.error('   1. Are your environment variables correct? (MYSQLHOST, MYSQLUSER, etc.)');
        console.error('   2. If using Railway, ensure the MySQL service is linked.');
        process.exit(1);
    }
}

// ============================================
// Create all required tables
// ============================================
async function createTables() {
    const connection = await pool.getConnection();

    try {
        // Users table (with register_number)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                phone VARCHAR(15) NOT NULL,
                register_number VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('student', 'admin') DEFAULT 'student',
                is_verified TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add register_number column if it doesn't exist (for existing databases)
        try {
            await connection.query(`
                ALTER TABLE users ADD COLUMN register_number VARCHAR(50) UNIQUE AFTER phone
            `);
            console.log('✅ Added register_number column to users table');
        } catch (e) {
            // Column already exists, ignore
        }

        // OTPs table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100) NOT NULL,
                otp VARCHAR(6) NOT NULL,
                purpose ENUM('register', 'reset') NOT NULL,
                is_used TINYINT(1) DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Slots table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS slots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                exam_name VARCHAR(200) NOT NULL,
                exam_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                venue VARCHAR(200) NOT NULL,
                capacity INT NOT NULL DEFAULT 30,
                booked INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bookings table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                slot_id INT NOT NULL,
                booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('confirmed', 'cancelled', 'rescheduled') DEFAULT 'confirmed',
                hall_ticket_no VARCHAR(50) UNIQUE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
            )
        `);

        // Login logs table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS login_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                email VARCHAR(100) NOT NULL,
                login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address VARCHAR(50),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ All tables verified/created');

        // Insert default admin if no admin exists
        const [admins] = await connection.query(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );
        if (admins.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await connection.query(
                `INSERT INTO users (name, email, phone, register_number, password, role, is_verified) 
                 VALUES (?, ?, ?, ?, ?, 'admin', 1)`,
                ['Admin', 'admin@exam.com', '9999999999', 'ADMIN001', hashedPassword]
            );
            console.log('✅ Default admin account created (admin@exam.com / admin123)');
        }

        // Insert sample slots if table is empty
        const [existingSlots] = await connection.query('SELECT COUNT(*) AS count FROM slots');
        if (existingSlots[0].count === 0) {
            await connection.query(`
                INSERT INTO slots (exam_name, exam_date, start_time, end_time, venue, capacity) VALUES
                ('Mathematics Final Exam', '2026-05-15', '09:00:00', '12:00:00', 'Hall A - Block 1', 30),
                ('Physics Midterm Exam', '2026-05-16', '10:00:00', '12:30:00', 'Hall B - Block 2', 25),
                ('Chemistry Lab Exam', '2026-05-17', '14:00:00', '16:00:00', 'Lab 3 - Science Block', 20),
                ('English Literature', '2026-05-18', '09:30:00', '11:30:00', 'Hall C - Block 1', 35),
                ('Computer Science Practical', '2026-05-19', '13:00:00', '16:00:00', 'Computer Lab 1', 30),
                ('History Final Exam', '2026-05-20', '10:00:00', '13:00:00', 'Hall A - Block 1', 30)
            `);
            console.log('✅ Sample exam slots inserted');
        }

        connection.release();
    } catch (error) {
        connection.release();
        console.error('❌ Error creating tables:', error.message);
        throw error;
    }
}

// ============================================
// Legacy testConnection function
// ============================================
async function testConnection() {
    await initializeDatabase();
}

module.exports = { pool, testConnection, initializeDatabase };
