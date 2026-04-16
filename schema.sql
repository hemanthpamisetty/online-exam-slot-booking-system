-- ============================================
-- Exam Slot Booking System — Database Schema
-- ============================================

-- Create the database
CREATE DATABASE IF NOT EXISTS exam_system;
USE exam_system;

-- ============================================
-- Users table (with register_number)
-- ============================================
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
);

-- ============================================
-- OTPs table (for registration and password reset)
-- ============================================
CREATE TABLE IF NOT EXISTS otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    purpose ENUM('register', 'reset') NOT NULL,
    is_used TINYINT(1) DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_lookup (email, otp, purpose, is_used)
);

-- ============================================
-- Exam Slots table
-- ============================================
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
);

-- ============================================
-- Bookings table
-- ============================================
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
);

-- ============================================
-- Login Logs table
-- ============================================
CREATE TABLE IF NOT EXISTS login_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(100) NOT NULL,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- Sample data (optional)
-- ============================================

-- Default admin user (password: admin123)
-- INSERT INTO users (name, email, phone, register_number, password, role, is_verified) 
-- VALUES ('Admin', 'admin@exam.com', '9999999999', 'ADMIN00001', '$2a$10$...', 'admin', 1);

-- Sample slots
-- INSERT INTO slots (exam_name, exam_date, start_time, end_time, venue, capacity) VALUES
-- ('Mathematics Final Exam', '2026-05-15', '09:00:00', '12:00:00', 'Hall A - Block 1', 30),
-- ('Physics Midterm Exam', '2026-05-16', '10:00:00', '12:30:00', 'Hall B - Block 2', 25);
