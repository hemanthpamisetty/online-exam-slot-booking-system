// ============================================
// Database Connection Module (Production Hardened)
// ============================================
const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================
// Database Configuration
// ============================================

// Priority: Railway MYSQL_URL > individual vars > defaults
const dbUrl = (process.env.MYSQL_URL || process.env.DATABASE_URL || '').trim();

const DB_CONFIG = {
    host: (process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1').trim(),
    user: (process.env.MYSQLUSER || process.env.DB_USER || 'root').trim(),
    password: (process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '').trim(),
    database: (process.env.MYSQLDATABASE || process.env.DB_NAME || 'exam_system').trim(),
    port: parseInt(process.env.MYSQLPORT) || parseInt(process.env.DB_PORT) || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

// ============================================
// Connection Pool Initialization
// ============================================

// Use URL if available, otherwise use config object
const pool = dbUrl 
    ? mysql.createPool(`${dbUrl}${dbUrl.includes('?') ? '&' : '?'}ssl={"rejectUnauthorized":false}`) 
    : mysql.createPool(DB_CONFIG);

console.log(`🗄️  Database Pool initialized. Target: ${dbUrl ? 'URL' : DB_CONFIG.host}`);

// ============================================
// Database Initialization Logic & Retry
// ============================================
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000;

async function initializeDatabase(retries = MAX_RETRIES) {
    try {
        console.log(`⏳ Verifying database connection... (Attempts left: ${retries})`);
        const [rows] = await pool.query('SELECT 1 + 1 AS test');
        console.log('✅ Base connection verified');

        // Create tables
        await createTables();
        
        console.log('🚀 Database initialization complete');
    } catch (error) {
        console.error('❌ Database connection failed!');
        console.error('   Error Message:', error.message);
        
        if (retries > 0) {
            console.log(`🔄 Retrying in ${RETRY_DELAY / 1000} seconds...`);
            await new Promise(res => setTimeout(res, RETRY_DELAY));
            return initializeDatabase(retries - 1);
        }

        console.error('❌ CRITICAL: Max retries reached. Database is down.');
        console.error('   Please check your MYSQL_URL or DB_HOST variables in Railway Settings.');
        // In production, we exit if DB is completely unavailable
        process.exit(1);
    }
}

// ============================================
// Create required tables
// ============================================
async function createTables() {
    const connection = await pool.getConnection();

    try {
        // Users Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                phone VARCHAR(15) NOT NULL,
                register_number VARCHAR(20) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('student', 'admin') DEFAULT 'student',
                is_verified TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // OTPs Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100) NOT NULL,
                otp VARCHAR(6) NOT NULL,
                purpose ENUM('register', 'reset') NOT NULL,
                is_used TINYINT(1) DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_otp_lookup (email, otp, purpose, is_used)
            )
        `);

        // Slots Table
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CHECK (booked >= 0),
                CHECK (booked <= capacity)
            )
        `);

        // Bookings Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                slot_id INT NOT NULL,
                booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('confirmed', 'cancelled', 'rescheduled') DEFAULT 'confirmed',
                hall_ticket_no VARCHAR(50) UNIQUE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
                INDEX idx_user_slot (user_id, slot_id, status)
            )
        `);

        // Login Logs Table
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

        // Create default admin if missing
        const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (admins.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashed = await bcrypt.hash('admin123', 10);
            await connection.query(
                `INSERT INTO users (name, email, phone, register_number, password, role, is_verified) 
                 VALUES (?, ?, ?, ?, ?, 'admin', 1)`,
                ['Admin', 'admin@exam.com', '9999999999', 'ADMIN00001', hashed]
            );
            console.log('👤 Created default admin account (admin@exam.com)');
        }

        connection.release();
    } catch (error) {
        connection.release();
        console.error('❌ Error in table creation:', error.message);
        throw error;
    }
}

// Legacy export for testConnection calls
async function testConnection() {
    await initializeDatabase();
}

module.exports = { pool, testConnection, initializeDatabase };
