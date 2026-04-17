// ============================================
// Email Service Module (Production Hardened)
// Primary: Brevo HTTP API (Bypasses Railway SMTP blocks)
// Fallback: Nodemailer (For Gmail testing)
// ============================================
const nodemailer = require('nodemailer');
require('dotenv').config();

let transporterReady = false;
let transporter = null;
let useBrevoApi = false;

// ============================================
// Detect configuration and setup mode
// ============================================
async function verifyEmailConnection() {
    console.log('⏳ Checking email service configuration...');

    // 1. Check for Brevo API Key (Best and most reliable for Railway)
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    if (brevoApiKey) {
        console.log('✅ Found BREVO_API_KEY. Using Brevo HTTP API (Port 443 - extremely reliable)');
        const maskedKey = brevoApiKey.substring(0, 4) + '...' + brevoApiKey.substring(brevoApiKey.length - 4);
        console.log(`   API KEY LOADED: ${maskedKey}`);
        
        // Small ping to check if API key is somewhat valid format
        if (brevoApiKey.startsWith('xkeysib-')) {
            useBrevoApi = true;
            transporterReady = true;
            console.log(`   From: ${getFromAddress()}`);
            console.log('   ⚠️ CRITICAL: Ensure the sender email above is VERIFIED in your Brevo Dashboard!');
            return true;
        } else {
             console.warn('⚠️ BREVO_API_KEY does not start with "xkeysib-". It might be invalid.');
        }
    }

    // 2. Check for SMTP credentials (Gmail fallback)
    const host = (process.env.EMAIL_HOST || '').trim();
    const user = (process.env.EMAIL_USER || '').trim();
    const pass = (process.env.EMAIL_PASS || '').trim();

    if (!user || !pass || user.includes('example.com')) {
        console.warn('⚠️  EMAIL WARNING: No BREVO_API_KEY and no valid SMTP credentials found.');
        console.warn('   To fix: Set BREVO_API_KEY in your .env or Railway variables.');
        console.warn('   📧 Safe-Mode enabled: OTPs will be logged to console instead of emailed.');
        transporterReady = false;
        return false;
    }

    try {
        let config = {};
        if (host.includes('gmail') || user.endsWith('@gmail.com')) {
            console.log('📧 Email provider detected: Gmail via SMTP');
            config = { service: 'gmail', auth: { user, pass } };
        } else {
            console.log(`📧 Email provider: Custom SMTP (${host})`);
            config = { host, port: parseInt(process.env.EMAIL_PORT) || 587, secure: false, auth: { user, pass } };
        }

        transporter = nodemailer.createTransport(config);
        await transporter.verify();
        console.log('✅ Email SMTP service connected successfully!');
        console.log(`   From: ${getFromAddress()}`);
        transporterReady = true;
        return true;
    } catch (err) {
        console.error('❌ EMAIL CONNECTION ERROR:', err.message);
        console.warn('⚠️  Entering Email Safe-Mode. OTPs will appear in server logs only.');
        transporterReady = false;
        return false;
    }
}

// ============================================
// Get the "from" address
// ============================================
function getFromAddress() {
    return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@exam.com';
}

// ============================================
// Brevo HTTP API Sender
// ============================================
async function sendViaBrevoApi(mailOptions, description) {
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    
    // Convert mailOptions to Brevo payload format
    const payload = {
        sender: { email: mailOptions.from, name: 'ExamSlot Booking' },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
    };

    try {
        console.log(`📧 Sending email via Brevo HTTP API: "${description}" to ${mailOptions.to}...`);
        
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
            console.log(`✅ Email sent successfully via Brevo: "${description}" (Message ID: ${data?.messageId})`);
            return { success: true, messageId: data?.messageId };
        } else {
            console.error(`❌ Brevo API Error [${response.status}]:`, data || response.statusText);
            if (response.status === 400 && data?.code === 'invalid_parameter') {
                console.error("   🚨 This usually means your sender email is NOT verified in Brevo.");
            }
            return { success: false, error: data?.message || response.statusText };
        }
    } catch (err) {
        console.error(`❌ Fetch Error when contacting Brevo API:`, err.message);
        return { success: false, error: err.message };
    }
}

// ============================================
// Wrapper to send mail with safety check
// ============================================
async function safeSendMail(mailOptions, description) {
    if (!mailOptions.from) {
        mailOptions.from = getFromAddress();
    }

    if (!transporterReady) {
        console.log(`\n📧 [EMAIL SAFE-MODE] Skipped: "${description}"`);
        console.log(`   To: ${mailOptions.to}`);
        return { success: true, mode: 'safe-mode' };
    }

    if (useBrevoApi) {
        return await sendViaBrevoApi(mailOptions, description);
    }

    try {
        console.log(`📧 Sending email via SMTP: "${description}" to ${mailOptions.to}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent via SMTP: "${description}" (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`❌ Email send FAILED for "${description}":`, err.message);
        return { success: false, error: err.message };
    }
}

// ============================================
// Specific Email Functions
// ============================================

async function sendOTPEmail(toEmail, otp, purpose) {
    const isRegister = purpose === 'register';
    const subject = isRegister ? '🎓 Verify Your Account' : '🔑 Password Reset OTP';

    console.log(`\n🔑 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔑 OTP for ${toEmail}: [ ${otp} ]`);
    console.log(`🔑 Purpose: ${purpose}`);
    console.log(`🔑 Expires: 5 minutes`);
    console.log(`🔑 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const mailOptions = {
        to: toEmail,
        subject: `${subject} - ExamSlot Booking`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 500px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 25px; text-align: center;">
                    <h2 style="margin:0; font-size: 22px;">🎓 ExamSlot Booking</h2>
                    <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">${isRegister ? 'Account Verification' : 'Password Reset'}</p>
                </div>
                <div style="padding: 35px; text-align: center; background: #ffffff;">
                    <p style="color: #334155; font-size: 16px; margin: 0 0 20px;">Your verification code is:</p>
                    <div style="background: #f1f5f9; border-radius: 10px; padding: 20px; display: inline-block;">
                        <h1 style="font-size: 42px; color: #4f46e5; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace; font-weight: bold;">${otp}</h1>
                    </div>
                    <p style="color: #64748b; font-size: 13px; margin: 20px 0 0;">⏱️ This code is valid for <strong>5 minutes</strong>.</p>
                </div>
            </div>
        `
    };

    return await safeSendMail(mailOptions, `OTP (${purpose})`);
}

async function sendAccountVerifiedEmail(toEmail) {
    const appUrl = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000';
    return await safeSendMail({
        to: toEmail,
        subject: '✅ Account Verified - ExamSlot Booking',
        html: `<p>Your account was verified! Login at ${appUrl}</p>`
    }, 'Account Verified');
}

async function sendBookingConfirmation(toEmail, data) {
    const hallTicket = data?.hall_ticket_no || 'N/A';
    return await safeSendMail({
        to: toEmail,
        subject: '🎫 Booking Confirmed - ExamSlot Booking',
        html: `<p>Booked! Hall ticket: ${hallTicket}</p>`
    }, 'Booking Confirmation');
}

async function sendCancellationNotification(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: '❌ Booking Cancelled - ExamSlot Booking',
        html: `<p>Your exam slot booking has been cancelled.</p>`
    }, 'Cancellation');
}

async function sendRescheduleNotification(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: '🔄 Booking Rescheduled - ExamSlot Booking',
        html: `<p>Your exam slot has been rescheduled.</p>`
    }, 'Rescheduled');
}

async function sendPasswordResetConfirmation(toEmail) {
    return await safeSendMail({
        to: toEmail,
        subject: '✅ Password Reset Successful',
        html: `<p>Your password was reset successfully.</p>`
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
