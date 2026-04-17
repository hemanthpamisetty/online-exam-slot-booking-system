// ============================================
// Email Service Module (Production Hardened)
// Priority 1: Gmail SMTP Port 465 (SSL) — best deliverability
// Priority 2: Brevo HTTP API — fallback
// Priority 3: Safe-Mode — OTPs logged to console
// ============================================
const nodemailer = require('nodemailer');
require('dotenv').config();

let transporterReady = false;
let transporter = null;
let emailMode = 'safe-mode'; // 'gmail-smtp' | 'brevo-api' | 'safe-mode'

// ============================================
// Detect configuration and setup mode
// ============================================
async function verifyEmailConnection() {
    console.log('\n--- EMAIL SERVICE STARTUP ---');

    // ──── PRIORITY 1: Gmail SMTP on Port 465 (SSL) ────
    const gmailUser = (process.env.EMAIL_USER || '').trim();
    const gmailPass = (process.env.EMAIL_PASS || '').trim();

    if (gmailUser && gmailPass && !gmailUser.includes('example.com')) {
        console.log('[EMAIL] Trying Gmail SMTP on Port 465 (SSL)...');
        try {
            transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true, // SSL on port 465
                auth: { user: gmailUser, pass: gmailPass },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000
            });

            await transporter.verify();
            emailMode = 'gmail-smtp';
            transporterReady = true;
            console.log('[EMAIL] Gmail SMTP (Port 465 SSL) connected!');
            console.log(`[EMAIL] Sender: ${gmailUser}`);
            console.log('--- EMAIL SERVICE READY (Gmail SMTP) ---\n');
            return true;
        } catch (err) {
            console.warn(`[EMAIL] Gmail SMTP failed: ${err.message}`);
            console.warn('[EMAIL] Trying Brevo API as fallback...');
            transporter = null;
        }
    }

    // ──── PRIORITY 2: Brevo HTTP API ────
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    if (brevoApiKey && brevoApiKey.startsWith('xkeysib-')) {
        emailMode = 'brevo-api';
        transporterReady = true;
        console.log('[EMAIL] Using Brevo HTTP API');
        console.log(`[EMAIL] Sender: ${getFromAddress()}`);
        console.log('--- EMAIL SERVICE READY (Brevo API) ---\n');
        return true;
    }

    // ──── PRIORITY 3: Safe-Mode (no email) ────
    emailMode = 'safe-mode';
    transporterReady = false;
    console.warn('[EMAIL] WARNING: No email credentials configured.');
    console.warn('[EMAIL] OTPs will be logged to console only.');
    console.warn('[EMAIL] To fix: Set EMAIL_USER + EMAIL_PASS (Gmail App Password) in Railway Variables.');
    console.warn('--- EMAIL SERVICE: SAFE-MODE ---\n');
    return false;
}

// ============================================
// Get the "from" address
// ============================================
function getFromAddress() {
    return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@exam.com';
}

// ============================================
// Shared HTML Email Template Builder
// ============================================
function buildEmailTemplate(title, bodyContent) {
    return `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:520px;margin:20px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:25px;text-align:center;">
            <h2 style="margin:0;font-size:22px;">ExamSlot Booking</h2>
            <p style="margin:5px 0 0;font-size:14px;opacity:0.9;">${title}</p>
        </div>
        <div style="padding:30px;background:#ffffff;">
            ${bodyContent}
        </div>
        <div style="background:#f8fafc;padding:15px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">This is an automated message from ExamSlot Booking System.</p>
        </div>
    </div>`;
}

// ============================================
// Brevo HTTP API Sender (Fallback)
// ============================================
async function sendViaBrevoApi(mailOptions, description) {
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (mailOptions.from || '').trim();

    if (!senderEmail || senderEmail === 'noreply@exam.com') {
        console.error(`[EMAIL] BLOCKED: Sender "${senderEmail}" is not valid. Set EMAIL_FROM in Railway Variables.`);
        return { success: false, error: 'EMAIL_FROM not configured' };
    }

    const payload = {
        sender: { email: senderEmail, name: 'ExamSlot Booking' },
        replyTo: { email: senderEmail, name: 'ExamSlot Support' },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
    };

    try {
        console.log(`[EMAIL] Brevo API: "${description}" -> ${mailOptions.to}`);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': brevoApiKey,
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (response.ok) {
            console.log(`[EMAIL] Brevo OK: "${description}" (ID: ${data?.messageId})`);
            return { success: true, messageId: data?.messageId };
        } else {
            console.error(`[EMAIL] Brevo ERROR [${response.status}]:`, JSON.stringify(data));
            return { success: false, error: data?.message || response.statusText };
        }
    } catch (err) {
        console.error(`[EMAIL] Brevo FETCH ERROR:`, err.message);
        return { success: false, error: err.message };
    }
}

// ============================================
// Gmail SMTP Sender (Primary)
// ============================================
async function sendViaGmailSmtp(mailOptions, description) {
    try {
        console.log(`[EMAIL] Gmail SMTP: "${description}" -> ${mailOptions.to}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Gmail OK: "${description}" (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[EMAIL] Gmail SMTP FAILED: "${description}" - ${err.message}`);
        return { success: false, error: err.message };
    }
}

// ============================================
// Wrapper: send mail using the active mode
// ============================================
async function safeSendMail(mailOptions, description) {
    if (!mailOptions.from) {
        mailOptions.from = getFromAddress();
    }

    if (emailMode === 'safe-mode') {
        console.log(`\n[EMAIL SAFE-MODE] Skipped: "${description}" to ${mailOptions.to}`);
        return { success: true, mode: 'safe-mode' };
    }

    if (emailMode === 'gmail-smtp') {
        return await sendViaGmailSmtp(mailOptions, description);
    }

    if (emailMode === 'brevo-api') {
        return await sendViaBrevoApi(mailOptions, description);
    }

    return { success: false, error: 'No email mode configured' };
}

// ============================================
// Specific Email Functions
// ============================================

async function sendOTPEmail(toEmail, otp, purpose) {
    const isRegister = purpose === 'register';
    const subject = isRegister ? 'Verify Your Account - ExamSlot Booking' : 'Password Reset OTP - ExamSlot Booking';

    console.log(`\n--- OTP DEBUG ---`);
    console.log(`OTP for ${toEmail}: [ ${otp} ]`);
    console.log(`Purpose: ${purpose}`);
    console.log(`Expires: 5 minutes`);
    console.log(`-----------------`);

    const mailOptions = {
        to: toEmail,
        subject: subject,
        html: buildEmailTemplate(isRegister ? 'Account Verification' : 'Password Reset', `
            <p style="color:#334155;font-size:16px;margin:0 0 20px;">Your verification code is:</p>
            <div style="background:#f1f5f9;border-radius:10px;padding:20px;display:inline-block;">
                <h1 style="font-size:42px;color:#4f46e5;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;font-weight:bold;">${otp}</h1>
            </div>
            <p style="color:#64748b;font-size:13px;margin:20px 0 0;">This code is valid for <strong>5 minutes</strong>.</p>
        `)
    };

    return await safeSendMail(mailOptions, `OTP (${purpose})`);
}

async function sendAccountVerifiedEmail(toEmail) {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const appUrl = process.env.APP_URL || (domain ? `https://${domain}` : 'http://localhost:3000');
    return await safeSendMail({
        to: toEmail,
        subject: 'Account Verified - ExamSlot Booking',
        html: buildEmailTemplate('Account Verified', `
            <p style="color:#334155;font-size:16px;">Great news! Your account has been <strong>verified</strong> by the administrator.</p>
            <p style="color:#334155;font-size:16px;">You can now log in and book your exam slots.</p>
            <div style="text-align:center;margin:25px 0;">
                <a href="${appUrl}" style="background:#4f46e5;color:white;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Login Now</a>
            </div>
        `)
    }, 'Account Verified');
}

async function sendBookingConfirmation(toEmail, data) {
    const hallTicket = data?.hall_ticket_no || 'N/A';
    return await safeSendMail({
        to: toEmail,
        subject: 'Booking Confirmed - ExamSlot Booking',
        html: buildEmailTemplate('Booking Confirmed', `
            <p style="color:#334155;font-size:16px;">Your exam slot has been booked successfully!</p>
            <div style="background:#f1f5f9;border-radius:10px;padding:20px;text-align:center;margin:20px 0;">
                <p style="color:#64748b;font-size:13px;margin:0 0 5px;">Your Hall Ticket Number</p>
                <h2 style="color:#4f46e5;font-size:28px;letter-spacing:3px;margin:0;font-family:'Courier New',monospace;">${hallTicket}</h2>
            </div>
            <p style="color:#64748b;font-size:14px;">Please save this hall ticket number. You will need it on exam day.</p>
        `)
    }, 'Booking Confirmation');
}

async function sendCancellationNotification(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: 'Booking Cancelled - ExamSlot Booking',
        html: buildEmailTemplate('Booking Cancelled', `
            <p style="color:#334155;font-size:16px;">Your exam slot booking has been <strong>cancelled</strong> as requested.</p>
            <p style="color:#64748b;font-size:14px;">If this was a mistake, you can book a new slot from your dashboard.</p>
        `)
    }, 'Cancellation');
}

async function sendRescheduleNotification(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: 'Booking Rescheduled - ExamSlot Booking',
        html: buildEmailTemplate('Booking Rescheduled', `
            <p style="color:#334155;font-size:16px;">Your exam slot booking has been <strong>rescheduled</strong> successfully.</p>
            <p style="color:#64748b;font-size:14px;">Please check your dashboard for the updated slot details and new hall ticket.</p>
        `)
    }, 'Rescheduled');
}

async function sendPasswordResetConfirmation(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: 'Password Reset Successful - ExamSlot Booking',
        html: buildEmailTemplate('Password Reset Successful', `
            <p style="color:#334155;font-size:16px;">Your password has been reset successfully.</p>
            <p style="color:#64748b;font-size:14px;">You can now log in with your new password.</p>
        `)
    }, 'Password Reset Confirmation');
}

module.exports = {
    verifyEmailConnection,
    sendOTPEmail,
    sendBookingConfirmation,
    sendRescheduleNotification,
    sendCancellationNotification,
    sendPasswordResetConfirmation,
    sendAccountVerifiedEmail
};
