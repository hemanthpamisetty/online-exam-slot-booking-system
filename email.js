// ============================================
// Email Service Module (Nodemailer)
// Sends OTP, booking, reschedule, cancel emails
// ============================================
const nodemailer = require('nodemailer');
require('dotenv').config();

// ============================================
// Create reusable transporter (Brevo SMTP)
// ============================================
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,  // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ============================================
// Verify transporter connection on startup
// Throws error if email is not configured
// ============================================
async function verifyEmailConnection() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS ||
        process.env.EMAIL_USER === 'your_brevo_email@example.com' ||
        process.env.EMAIL_PASS === 'your_brevo_smtp_key' ||
        process.env.EMAIL_USER === 'your_email@gmail.com' ||
        process.env.EMAIL_PASS === 'your_gmail_app_password') {
        throw new Error(
            'Email credentials not configured!\n' +
            '   Please update .env file with your Brevo SMTP credentials:\n' +
            '   EMAIL_HOST=smtp-relay.brevo.com\n' +
            '   EMAIL_USER=your_brevo_login_email\n' +
            '   EMAIL_PASS=your_brevo_smtp_key\n' +
            '   (Sign up free at https://www.brevo.com → Settings → SMTP & API)'
        );
    }

    await transporter.verify();
    console.log('✅ Email service (Brevo) connected successfully!');
    return true;
}

// ============================================
// Helper: Format date for email display
// ============================================
function formatDateForEmail(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ============================================
// Helper: Format time for email display
// ============================================
function formatTimeForEmail(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
}

// ============================================
// Send OTP Email (registration / password reset)
// ============================================
async function sendOTPEmail(toEmail, otp, purpose) {
    const subjects = {
        register: '🎓 Verify Your Account - ExamSlot Booking',
        reset: '🔑 Password Reset - ExamSlot Booking'
    };

    const headings = {
        register: 'Verify Your Account',
        reset: 'Password Reset'
    };

    const descriptions = {
        register: 'Thank you for registering! Use the OTP below to verify your account:',
        reset: 'A password reset was requested for your account. Use the OTP below to reset your password:'
    };

    const subject = subjects[purpose] || 'OTP Verification - ExamSlot Booking';
    const heading = headings[purpose] || 'OTP Verification';
    const description = descriptions[purpose] || 'Use the OTP below:';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 30px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🎓 ExamSlot Booking</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">${heading}</p>
            </div>
            
            <!-- Body -->
            <div style="padding: 32px 24px;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    ${description}
                </p>
                
                <!-- OTP Box -->
                <div style="background: #f5f3ff; border: 2px dashed #4f46e5; border-radius: 10px; padding: 20px; text-align: center; margin: 0 0 24px;">
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your OTP Code</p>
                    <p style="color: #4f46e5; font-size: 36px; font-weight: 700; letter-spacing: 8px; margin: 0;">${otp}</p>
                </div>
                
                <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
                    ⏱️ This OTP is valid for <strong>5 minutes</strong>.<br>
                    If you did not request this, please ignore this email.
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    Online Exam Slot Booking System &copy; ${new Date().getFullYear()}
                </p>
            </div>
        </div>
    </body>
    </html>
    `;

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: subject,
        html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 OTP email sent to ${toEmail} (${purpose}): ${info.messageId}`);
    return { success: true, messageId: info.messageId };
}

// ============================================
// Send Booking Confirmation / Hall Ticket Email
// ============================================
async function sendBookingConfirmation(toEmail, ticketData) {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 550px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🎫 Exam Hall Ticket</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your exam has been booked successfully!</p>
            </div>
            
            <div style="padding: 32px 24px;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    Your exam slot has been confirmed. Please find your hall ticket details below:
                </p>
                
                <!-- Hall Ticket Details -->
                <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; padding: 24px; margin: 0 0 24px;">
                    <div style="text-align: center; margin-bottom: 16px;">
                        <p style="color: #64748b; font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Hall Ticket Number</p>
                        <p style="color: #059669; font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 4px 0 0;">${ticketData.hall_ticket_no}</p>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; width: 140px;">Student Name</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${ticketData.student_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Register Number</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${ticketData.register_number}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Exam Name</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${ticketData.exam_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Exam Date</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${formatDateForEmail(ticketData.exam_date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Time</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${formatTimeForEmail(ticketData.start_time)} - ${formatTimeForEmail(ticketData.end_time)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Venue</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${ticketData.venue}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Booking ID</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">#${ticketData.booking_id}</td>
                        </tr>
                    </table>
                </div>
                
                <p style="color: #dc2626; font-size: 13px; line-height: 1.5; margin: 0; background: #fef2f2; padding: 12px; border-radius: 6px;">
                    ⚠️ Please carry this hall ticket along with a valid photo ID to the exam center.
                </p>
            </div>
            
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Online Exam Slot Booking System &copy; ${new Date().getFullYear()}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: '🎫 Exam Hall Ticket - Booking Confirmed',
        html: htmlContent
    });
    console.log(`📧 Booking confirmation sent to ${toEmail}: ${info.messageId}`);
    return { success: true };
}

// ============================================
// Send Reschedule Notification Email
// ============================================
async function sendRescheduleNotification(toEmail, oldSlot, newSlot, hallTicketNo) {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 550px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            
            <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🔄 Slot Rescheduled</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your exam slot has been changed successfully</p>
            </div>
            
            <div style="padding: 32px 24px;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    Your exam slot has been rescheduled. Here are the details:
                </p>
                
                <!-- Old Slot (crossed out) -->
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
                    <p style="color: #dc2626; font-weight: 600; margin: 0 0 8px; font-size: 13px;">❌ OLD SLOT (Cancelled)</p>
                    <p style="color: #64748b; font-size: 13px; margin: 0; text-decoration: line-through;">
                        ${oldSlot.exam_name} | ${formatDateForEmail(oldSlot.exam_date)} | ${formatTimeForEmail(oldSlot.start_time)} - ${formatTimeForEmail(oldSlot.end_time)} | ${oldSlot.venue}
                    </p>
                </div>
                
                <!-- New Slot -->
                <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
                    <p style="color: #059669; font-weight: 600; margin: 0 0 8px; font-size: 13px;">✅ NEW SLOT (Confirmed)</p>
                    <p style="color: #1e293b; font-size: 13px; margin: 0;">
                        <strong>${newSlot.exam_name}</strong><br>
                        📅 ${formatDateForEmail(newSlot.exam_date)}<br>
                        🕐 ${formatTimeForEmail(newSlot.start_time)} - ${formatTimeForEmail(newSlot.end_time)}<br>
                        📍 ${newSlot.venue}
                    </p>
                </div>
                
                <div style="text-align: center; background: #f5f3ff; padding: 12px; border-radius: 6px;">
                    <p style="color: #64748b; font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">New Hall Ticket Number</p>
                    <p style="color: #4f46e5; font-size: 20px; font-weight: 700; letter-spacing: 2px; margin: 4px 0 0;">${hallTicketNo}</p>
                </div>
            </div>
            
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Online Exam Slot Booking System &copy; ${new Date().getFullYear()}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: '🔄 Slot Rescheduled - ExamSlot Booking',
        html: htmlContent
    });
    console.log(`📧 Reschedule notification sent to ${toEmail}: ${info.messageId}`);
    return { success: true };
}

// ============================================
// Send Cancellation Notification Email
// ============================================
async function sendCancellationNotification(toEmail, bookingDetails) {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 550px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            
            <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">❌ Booking Cancelled</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your exam booking has been cancelled</p>
            </div>
            
            <div style="padding: 32px 24px;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    Your exam booking has been cancelled successfully. Here are the details of the cancelled booking:
                </p>
                
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; width: 130px;">Hall Ticket No</td>
                            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${bookingDetails.hall_ticket_no}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Exam Name</td>
                            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${bookingDetails.exam_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Exam Date</td>
                            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${formatDateForEmail(bookingDetails.exam_date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Time</td>
                            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${formatTimeForEmail(bookingDetails.start_time)} - ${formatTimeForEmail(bookingDetails.end_time)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Venue</td>
                            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${bookingDetails.venue}</td>
                        </tr>
                    </table>
                </div>
                
                <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">
                    If you wish to book a new slot, please visit the booking page.
                    If you did not request this cancellation, please contact support immediately.
                </p>
            </div>
            
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Online Exam Slot Booking System &copy; ${new Date().getFullYear()}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: '❌ Booking Cancelled - ExamSlot Booking',
        html: htmlContent
    });
    console.log(`📧 Cancellation notification sent to ${toEmail}: ${info.messageId}`);
    return { success: true };
}

// ============================================
// Send Password Reset Confirmation Email
// ============================================
async function sendPasswordResetConfirmation(toEmail) {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">✅ Password Reset Successful</h1>
            </div>
            <div style="padding: 32px 24px;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Your password has been successfully reset. You can now log in with your new password.
                </p>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 16px;">
                    If you did not make this change, please contact support immediately.
                </p>
            </div>
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Online Exam Slot Booking System &copy; ${new Date().getFullYear()}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: toEmail,
            subject: '✅ Password Reset Successful - ExamSlot Booking',
            html: htmlContent
        });
    } catch (error) {
        console.error('Failed to send reset confirmation:', error.message);
    }
}

module.exports = {
    verifyEmailConnection,
    sendOTPEmail,
    sendBookingConfirmation,
    sendRescheduleNotification,
    sendCancellationNotification,
    sendPasswordResetConfirmation
};
