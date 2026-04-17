// ============================================
// Hall Ticket Page JavaScript
// Handles: Fetch and display hall ticket
// ============================================

const API = '';
const alertBox = document.getElementById('alertBox');

// ============================================
// Show alert
// ============================================
function showAlert(message, type = 'error') {
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    setTimeout(() => { alertBox.classList.remove('show'); }, 5000);
}

// ============================================
// Format helpers
// ============================================
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
}

// ============================================
// Check auth & load ticket
// ============================================
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) {
            window.location.href = 'index.html';
            return;
        }
        loadTicket();
    } catch (err) {
        window.location.href = 'index.html';
    }
}

// ============================================
// Load hall ticket data
// ============================================
async function loadTicket() {
    // Get booking ID from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('id');

    if (!bookingId) {
        showAlert('No booking ID provided. Go back to dashboard.');
        return;
    }

    try {
        const res = await fetch(`${API}/api/slots/hall-ticket/${bookingId}`, {
            credentials: 'include'
        });
        const data = await res.json();

        if (!data.success) {
            showAlert(data.message);
            return;
        }

        const t = data.ticket;

        // Fill in ticket details
        document.getElementById('ticketNo').textContent = t.hall_ticket_no;
        document.getElementById('ticketName').textContent = t.student_name;
        document.getElementById('ticketRegNo').textContent = t.register_number || '—';
        document.getElementById('ticketEmail').textContent = t.student_email;
        document.getElementById('ticketPhone').textContent = t.student_phone;
        document.getElementById('ticketExam').textContent = t.exam_name;
        document.getElementById('ticketDate').textContent = formatDate(t.exam_date);
        document.getElementById('ticketTime').textContent = `${formatTime(t.start_time)} - ${formatTime(t.end_time)}`;
        document.getElementById('ticketVenue').textContent = t.venue;
        if (document.getElementById('ticketVenue2')) {
            document.getElementById('ticketVenue2').textContent = t.venue;
        }
        document.getElementById('ticketStatus').textContent = t.status.toUpperCase();

        // Show the ticket
        document.getElementById('hallTicket').style.display = 'block';

    } catch (err) {
        showAlert('Error loading hall ticket');
    }
}

// ============================================
// Logout
// ============================================
async function logout() {
    try {
        await fetch(`${API}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) { /* ignore */ }
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Initialize
checkAuth();
