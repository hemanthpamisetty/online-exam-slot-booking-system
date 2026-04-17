// ============================================
// Dashboard Page JavaScript
// Handles: View bookings, cancel, reschedule
// ============================================

const API = '';
const alertBox = document.getElementById('alertBox');
let currentBookingId = null;  // For reschedule

// ============================================
// Show alert
// ============================================
function showAlert(message, type = 'error') {
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    setTimeout(() => { alertBox.classList.remove('show'); }, 5000);
}

// ============================================
// Format date nicely
// ============================================
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

// ============================================
// Format time (HH:MM:SS -> HH:MM AM/PM)
// ============================================
function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
}

// ============================================
// Check auth & load user info
// ============================================
async function checkAuth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/auth/me`, {
            credentials: 'include',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        if (!data.success) {
            window.location.href = 'index.html';
            return;
        }

        // If admin, redirect to admin page
        if (data.user.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }

        document.getElementById('userName').textContent = data.user.name;
        loadBookings();
    } catch (err) {
        window.location.href = 'index.html';
    }
}

// ============================================
// Load user's bookings
// ============================================
async function loadBookings() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/slots/my-bookings`, {
            credentials: 'include',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        const container = document.getElementById('bookingsContainer');
        const emptyState = document.getElementById('emptyState');

        if (!data.success || data.bookings.length === 0) {
            container.innerHTML = '';
            container.appendChild(emptyState);
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        let html = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Exam</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Venue</th>
                        <th>Hall Ticket</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        data.bookings.forEach(b => {
            const statusBadge = `<span class="badge badge-${b.status}">${b.status}</span>`;

            let actions = '';
            if (b.status === 'confirmed') {
                actions = `
                    <a href="hall-ticket.html?id=${b.id}" class="btn btn-sm btn-primary" title="View Hall Ticket">🎫</a>
                    <button class="btn btn-sm btn-outline" onclick="openReschedule(${b.id})" title="Reschedule">🔄</button>
                    <button class="btn btn-sm btn-danger" onclick="cancelBooking(${b.id})" title="Cancel">✖</button>
                `;
            } else {
                actions = '<span style="color: var(--text-lighter); font-size: 0.82rem;">—</span>';
            }

            html += `
                <tr>
                    <td><strong>${b.exam_name}</strong></td>
                    <td>${formatDate(b.exam_date)}</td>
                    <td>${formatTime(b.start_time)} - ${formatTime(b.end_time)}</td>
                    <td>${b.venue}</td>
                    <td><code>${b.hall_ticket_no || '—'}</code></td>
                    <td>${statusBadge}</td>
                    <td style="white-space: nowrap;">${actions}</td>
                </tr>`;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (err) {
        showAlert('Error loading bookings');
    }
}

// ============================================
// Cancel a booking
// ============================================
async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/slots/cancel/${bookingId}`, {
            method: 'DELETE',
            credentials: 'include',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            showAlert('Booking cancelled successfully', 'success');
            loadBookings();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Error cancelling booking');
    }
}

// ============================================
// Reschedule: Open modal with available slots
// ============================================
async function openReschedule(bookingId) {
    currentBookingId = bookingId;

    try {
        const res = await fetch(`${API}/api/slots`, { credentials: 'include' });
        const data = await res.json();

        const container = document.getElementById('availableSlotsContainer');

        if (!data.success || data.slots.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No slots available for rescheduling.</p></div>';
        } else {
            let html = '';
            data.slots.forEach(slot => {
                const available = slot.capacity - slot.booked;
                const isFull = available <= 0;

                html += `
                <div class="card" style="margin-bottom: 0.75rem; ${isFull ? 'opacity: 0.5;' : ''}">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                            <strong>${slot.exam_name}</strong><br>
                            <span style="font-size: 0.82rem; color: var(--text-light);">
                                ${formatDate(slot.exam_date)} | ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)} | ${slot.venue}
                            </span><br>
                            <span class="availability ${isFull ? 'full' : 'available'}" style="font-size: 0.82rem;">
                                ${isFull ? 'Full' : `${available} seats available`}
                            </span>
                        </div>
                        ${isFull ? '' : `<button class="btn btn-sm btn-success" onclick="reschedule(${slot.id})">Select</button>`}
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        document.getElementById('rescheduleModal').classList.add('show');

    } catch (err) {
        showAlert('Error loading available slots');
    }
}

// ============================================
// Reschedule: Confirm reschedule
// ============================================
async function reschedule(newSlotId) {
    try {
        const res = await fetch(`${API}/api/slots/reschedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ bookingId: currentBookingId, newSlotId })
        });

        const data = await res.json();

        if (data.success) {
            closeModal();
            showAlert('Booking rescheduled successfully!', 'success');
            loadBookings();
        } else {
            const modalAlert = document.getElementById('modalAlert');
            modalAlert.className = 'alert alert-error show';
            modalAlert.textContent = data.message;
        }
    } catch (err) {
        showAlert('Error rescheduling booking');
    }
}

// ============================================
// Close modal
// ============================================
function closeModal() {
    document.getElementById('rescheduleModal').classList.remove('show');
    currentBookingId = null;
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
